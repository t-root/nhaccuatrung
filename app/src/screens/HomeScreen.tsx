// Trang DUY NHẤT gộp .sidebar + .hero + #playerBar + .content-section của
// index.html gốc — đúng cấu trúc mobile gốc (@media max-width:640px): mọi thứ
// cuộn chung một luồng, không có tab bar. Brand/upload/nav/artists/playlists/
// visualizer/player-bar nằm trong ListHeaderComponent của FlatList; track-list
// (`data`) là phần duy nhất thật sự "danh sách dài" bên dưới.
import React from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useStore } from '@/state/store';
import { TrackRow } from '@/components/TrackRow';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { PlayerBar } from '@/components/PlayerBar';
import { AddToPlaylistSheet } from '@/components/AddToPlaylistSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AddTracksSheet } from '@/components/AddTracksSheet';
import { colors, fonts, radius, spacing } from '@/theme';
import { durationLabel } from '@/utils/time';
import type { Track, View as ViewState } from '@/types';

// Các hàng của FlatList chính: PlayerBar (sticky) → toolbar/nút hành động → danh sách bài.
type Row =
  | { kind: 'player' }
  | { kind: 'toolbar' }
  | { kind: 'empty' }
  | { kind: 'track'; track: Track; index: number };

const AUDIO_EXTENSION =/\.(mp3|wav|m4a|ogg|flac|aac)$/i;

// SAF (Storage Access Framework) URI dạng content://.../tree/primary%3AMusic%2FBray hoặc
// .../document/primary%3AMusic%2FBray%2FSong.mp3 — sau khi decode, tên thư mục/file luôn
// là đoạn cuối cùng sau dấu "/".
function nameFromSafUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const segments = decoded.split('/');
  return segments[segments.length - 1] || decoded;
}

function titleFor(view: ViewState, playlistName?: string) {
  if (view.type === 'folder') return view.value;
  if (view.type === 'playlist') return playlistName || 'Playlist';
  return { all: 'Tất cả bài hát', recent: 'Nghe gần đây', favorites: 'Yêu thích' }[view.type];
}

// Tương đương 3 nút .nav-item (data-view="all|recent|favorites") trong sidebar gốc.
const BASE_VIEWS: { type: 'all' | 'recent' | 'favorites'; label: string; icon: string }[] = [
  { type: 'all', label: 'Tất cả', icon: '⌂' },
  { type: 'recent', label: 'Gần đây', icon: '◷' },
  { type: 'favorites', label: 'Yêu thích', icon: '♡' },
];

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const visibleTracks = useStore((s) => s.visibleTracks);
  const currentTrack = useStore((s) => s.currentTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const persisted = useStore((s) => s.persisted);
  const playTrack = useStore((s) => s.playTrack);
  const playCurrentList = useStore((s) => s.playCurrentList);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const addToQueue = useStore((s) => s.addToQueue);
  const removeFromPlaylist = useStore((s) => s.removeFromPlaylist);
  const deleteTrack = useStore((s) => s.deleteTrack);
  const loadStatus = useStore((s) => s.loadStatus);
  const loadError = useStore((s) => s.loadError);
  const artists = useStore((s) => s.artists)();
  const tracksAll = useStore((s) => s.tracks);
  const canWrite = useStore((s) => s.canWrite);
  const renameArtist = useStore((s) => s.renameArtist);
  const deleteArtist = useStore((s) => s.deleteArtist);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const createPlaylistFromArtists = useStore((s) => s.createPlaylistFromArtists);
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  const renamePlaylist = useStore((s) => s.renamePlaylist);
  const refreshPlaylistFromGitHub = useStore((s) => s.refreshPlaylistFromGitHub);
  const uploadLocalFiles = useStore((s) => s.uploadLocalFiles);
  const showToast = useStore((s) => s.showToast);
  const playlistRepeat = useStore((s) => s.playlistRepeat);
  const togglePlaylistRepeat = useStore((s) => s.togglePlaylistRepeat);

  const [playlistDialogFor, setPlaylistDialogFor] = React.useState<string | null>(null);
  const [addTracksOpen, setAddTracksOpen] = React.useState(false);
  const [renamingCollection, setRenamingCollection] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [creatingPlaylist, setCreatingPlaylist] = React.useState(false);
  const [newPlaylistName, setNewPlaylistName] = React.useState('');
  // Tạo playlist: 'manual' = tự đặt tên, 'artists' = chọn ≥2 nghệ sĩ, tên tự đặt bằng cách nối tên họ.
  const [playlistSource, setPlaylistSource] = React.useState<'manual' | 'artists'>('manual');
  const [pickedArtists, setPickedArtists] = React.useState<string[]>([]);

  const tracks = visibleTracks();
  const playlistObj = view.type === 'playlist' ? persisted.playlists.find((p) => p.id === view.value) : undefined;
  const heading = titleFor(view, playlistObj?.name);
  const closeCreatePlaylist = () => {
    setCreatingPlaylist(false);
    setNewPlaylistName('');
    setPlaylistSource('manual');
    setPickedArtists([]);
  };
  const orderedPickedArtists = artists.filter((a) => pickedArtists.includes(a));
  const artistTrackCount = (names: string[]) =>
    tracksAll.filter((t) => names.includes(t.artist) && !persisted.hidden.includes(t.id)).length;
  const submitCreatePlaylist = () => {
    if (playlistSource === 'artists') {
      if (orderedPickedArtists.length < 2) return showToast('Chọn từ 2 nghệ sĩ trở lên.');
      createPlaylistFromArtists(orderedPickedArtists);
    } else if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
    }
    closeCreatePlaylist();
  };
  const stats = `${tracks.length} bài hát${view.type === 'all' ? ` · ${artists.length} nghệ sĩ` : ''} · ${durationLabel(tracks)}`;

  // Tương đương updatePlaylistRepeatButton()/updateClearCurrentCollectionButton() trong app.js:
  // 2 nút này chỉ xuất hiện khi đang xem 1 nghệ sĩ (folder) hoặc 1 playlist cụ thể.
  const inCollection = view.type === 'folder' || view.type === 'playlist';
  const collectionLabel = view.type === 'folder' ? 'nghệ sĩ' : 'playlist';
  const collectionDisabled = !canWrite || (view.type === 'playlist' ? !playlistObj : tracks.length === 0);
  const [confirmState, setConfirmState] = React.useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const clearCurrentCollection = () => {
    const name = view.type === 'folder' ? view.value : playlistObj?.name ?? '';
    setConfirmState({
      title: `Xóa ${collectionLabel}`,
      message: `Xóa ${collectionLabel} "${name}"?`,
      onConfirm: () => {
        if (view.type === 'folder') deleteArtist(view.value);
        else deletePlaylist(view.value);
        setConfirmState(null);
      },
    });
  };
  // Tương đương data-edit-artist/data-edit-playlist trong renderPlaylists() —
  // trên mobile bản gốc CHỈ hiện 2 icon này bên trong khi đang mở 1 nghệ sĩ/playlist
  // cụ thể (nút "✎ Đổi tên" trong toolbar), không hiện trực tiếp trên từng chip.
  const openRenameCollection = () => {
    setRenameValue(view.type === 'folder' ? view.value : playlistObj?.name ?? '');
    setRenamingCollection(true);
  };
  const saveRenameCollection = () => {
    if (view.type === 'folder') renameArtist(view.value, renameValue.trim());
    else if (view.type === 'playlist') renamePlaylist(view.value, renameValue.trim());
    setRenamingCollection(false);
  };

  // Tương đương #fileInput trong index.html gốc: tải TỪNG FILE riêng lẻ, luôn hỏi
  // "Chọn nghệ sĩ" (trừ khi đang mở sẵn đúng 1 nghệ sĩ).
  const [artistPickerResolve, setArtistPickerResolve] = React.useState<((name: string) => void) | null>(null);
  const chooseUploadArtist = (): Promise<string> => {
    if (view.type === 'folder') return Promise.resolve(view.value);
    if (!artists.length) {
      showToast('Chưa có nghệ sĩ nào trên GitHub để chọn.');
      return Promise.resolve('');
    }
    return new Promise((resolve) => setArtistPickerResolve(() => resolve));
  };
  const pickAndUploadTracks = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const artistName = await chooseUploadArtist();
    if (!artistName) return;
    const files = result.assets.map((a) => ({ uri: a.uri, name: a.name }));
    uploadLocalFiles(files, artistName);
  };

  // Tương đương #folderUploadButton trong app.js gốc: chọn CẢ MỘT THƯ MỤC, tự suy ra
  // tên nghệ sĩ từ tên thư mục (isFolderUpload → không hỏi lại "Chọn nghệ sĩ"). RN dùng
  // Storage Access Framework của Android (expo-file-system) để mở picker chọn thư mục —
  // chỉ chạy trên Android vì SAF không tồn tại trên iOS.
  const pickAndUploadFolder = async () => {
    if (Platform.OS !== 'android') {
      showToast('Tải thư mục chỉ hỗ trợ trên Android.');
      return;
    }
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return;
    const artistName = nameFromSafUri(permission.directoryUri);
    const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(permission.directoryUri);
    const files = entries
      .map((uri) => ({ uri, name: nameFromSafUri(uri) }))
      .filter((file) => AUDIO_EXTENSION.test(file.name));
    if (!files.length) {
      showToast('Thư mục không có file nhạc hợp lệ.');
      return;
    }
    uploadLocalFiles(files, artistName);
  };

  const openArtist = (name: string) => setView({ type: 'folder', value: name });
  const openPlaylist = (id: string) => {
    setView({ type: 'playlist', value: id });
    refreshPlaylistFromGitHub(id);
  };

  const rows: Row[] = [
    { kind: 'player' },
    { kind: 'toolbar' },
    ...(tracks.length ? tracks.map((track, index): Row => ({ kind: 'track', track, index })) : [{ kind: 'empty' } as Row]),
  ];

  const header = (
    <View>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>♫ Nhạc Của Trung</Text>
        <View style={styles.brandActions}>
          <Pressable hitSlop={8} style={styles.iconButtonFile} onPress={pickAndUploadTracks}>
            <Text style={styles.iconButtonText}>♪</Text>
          </Pressable>
          <Pressable hitSlop={8} style={styles.iconButtonFolder} onPress={pickAndUploadFolder}>
            <Text style={styles.iconButtonText}>▣</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            placeholder="Tìm bài hát, nghệ sĩ..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
        <Pressable hitSlop={8} style={styles.roundButton} onPress={() => navigation.navigate('Queue')}>
          <Text style={styles.roundButtonText}>≡</Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        {BASE_VIEWS.map((item) => (
          <Pressable
            key={item.type}
            style={[styles.navItem, view.type === item.type && styles.navItemActive]}
            onPress={() => setView({ type: item.type, value: '' })}
          >
            <Text style={[styles.navIcon, view.type === item.type && styles.navIconActive]}>{item.icon}</Text>
            <Text style={[styles.navLabel, view.type === item.type && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionHeading}>ARTISTS</Text>
      <FlatList
        horizontal
        data={artists}
        keyExtractor={(a) => a}
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        ListEmptyComponent={<Text style={styles.sidebarNote}>Chưa có nghệ sĩ</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.chip, view.type === 'folder' && view.value === item && styles.chipActive]} onPress={() => openArtist(item)}>
            <Text style={[styles.chipText, view.type === 'folder' && view.value === item && styles.chipTextActive]} numberOfLines={1}>
              {item}
            </Text>
          </Pressable>
        )}
      />

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeading}>PLAYLISTS</Text>
        {canWrite && (
          <Pressable hitSlop={8} onPress={() => setCreatingPlaylist(true)}>
            <Text style={styles.sectionAdd}>+</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        horizontal
        data={persisted.playlists}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        ListEmptyComponent={<Text style={styles.sidebarNote}>Chưa có playlist</Text>}
        renderItem={({ item }) => (
          <Pressable style={[styles.chip, view.type === 'playlist' && view.value === item.id && styles.chipActive]} onPress={() => openPlaylist(item.id)}>
            <Text style={[styles.chipText, view.type === 'playlist' && view.value === item.id && styles.chipTextActive]} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />

    </View>
  );

  // Phần dưới PlayerBar tách riêng khỏi header để PlayerBar thành 1 item của FlatList,
  // nhờ đó stickyHeaderIndices ghim được riêng nó ở top khi cuộn.
  const toolbarBlock = (
    <View>
      <View style={styles.toolbar}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.stats}>{stats}</Text>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.primaryButton} onPress={() => playCurrentList(false)}>
          <Text style={styles.primaryButtonText}>▶ Phát tất cả</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => playCurrentList(true)}>
          <Text style={styles.secondaryButtonText}>⤨ Ngẫu nhiên</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setSort(sort === 'default' ? 'title' : sort === 'title' ? 'artist' : 'default')}
        >
          <Text style={styles.secondaryButtonText}>
            {sort === 'default' ? 'Mới thêm' : sort === 'title' ? 'Tên bài hát' : 'Nghệ sĩ'}
          </Text>
        </Pressable>
        {inCollection && (
          <Pressable
            style={[styles.secondaryButton, playlistRepeat && styles.secondaryButtonActive]}
            onPress={togglePlaylistRepeat}
          >
            <Text style={[styles.secondaryButtonText, playlistRepeat && styles.secondaryButtonTextActive]}>
              {playlistRepeat ? `↻ ${view.type === 'folder' ? 'Nghệ sĩ' : 'Playlist'}` : `↻ Lặp ${collectionLabel}`}
            </Text>
          </Pressable>
        )}
        {view.type === 'playlist' && canWrite && (
          <Pressable style={styles.secondaryButton} onPress={() => setAddTracksOpen(true)}>
            <Text style={styles.secondaryButtonText}>+ Thêm bài hát</Text>
          </Pressable>
        )}
        {inCollection && canWrite && (
          <Pressable style={styles.secondaryButton} onPress={openRenameCollection}>
            <Text style={styles.secondaryButtonText}>✎ Đổi tên</Text>
          </Pressable>
        )}
        {inCollection && (
          <Pressable
            style={[styles.secondaryButton, collectionDisabled && styles.secondaryButtonDisabled]}
            disabled={collectionDisabled}
            onPress={clearCurrentCollection}
          >
            <Text style={styles.secondaryButtonText}>× Xóa {collectionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loadStatus === 'loading' && tracksAll.length === 0 ? (
        <LoadingScreen />
      ) : loadStatus === 'error' ? (
        <EmptyState message={loadError || 'Không tải được thư viện. Kéo để thử lại.'} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => (row.kind === 'track' ? row.track.id : row.kind)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          ListHeaderComponent={header}
          // Có ListHeaderComponent thì chỉ số item dữ liệu bị lệch +1: item 0 (PlayerBar) = 1.
          stickyHeaderIndices={[1]}
          renderItem={({ item: row }) => {
            if (row.kind === 'player') {
              return (
                <View style={styles.stickyPlayer}>
                  <PlayerBar />
                </View>
              );
            }
            if (row.kind === 'toolbar') return toolbarBlock;
            if (row.kind === 'empty') {
              return <EmptyState message="Chưa có bài hát phù hợp" description="Thử đổi từ khóa hoặc tải lên một thư mục nhạc." />;
            }
            const { track, index } = row;
            return (
              <TrackRow
                track={track}
                index={index}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying}
                liked={persisted.favorites.includes(track.id)}
                inPlaylistView={view.type === 'playlist'}
                onPlay={() => playTrack(track, tracks)}
                onFavorite={() => toggleFavorite(track.id)}
                onQueue={() => addToQueue(track.id)}
                onAddToPlaylist={() => setPlaylistDialogFor(track.id)}
                onRemove={() => (view.type === 'playlist' ? removeFromPlaylist(view.value, track.id) : deleteTrack(track.id))}
              />
            );
          }}
        />
      )}

      {playlistDialogFor && <AddToPlaylistSheet trackId={playlistDialogFor} onClose={() => setPlaylistDialogFor(null)} />}
      {addTracksOpen && view.type === 'playlist' && <AddTracksSheet playlistId={view.value} onClose={() => setAddTracksOpen(false)} />}

      {renamingCollection && (
        <View style={sheetStyles.dialogOverlay}>
          <View style={sheetStyles.dialog}>
            <Text style={sheetStyles.dialogTitle}>Đổi tên {collectionLabel}</Text>
            <TextInput style={sheetStyles.input} value={renameValue} onChangeText={setRenameValue} autoFocus />
            <View style={sheetStyles.dialogActions}>
              <Pressable onPress={() => setRenamingCollection(false)}>
                <Text style={sheetStyles.cancelText}>Hủy</Text>
              </Pressable>
              <Pressable onPress={saveRenameCollection}>
                <Text style={sheetStyles.saveText}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {creatingPlaylist && (
        <View style={sheetStyles.dialogOverlay}>
          <View style={sheetStyles.dialog}>
            <Text style={sheetStyles.dialogTitle}>Tạo playlist</Text>
            <View style={sheetStyles.switchRow}>
              {([['manual', 'Đặt tên tự do'], ['artists', 'Từ nghệ sĩ']] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[sheetStyles.switchButton, playlistSource === value && sheetStyles.switchButtonActive]}
                  onPress={() => setPlaylistSource(value)}
                >
                  <Text style={[sheetStyles.switchText, playlistSource === value && sheetStyles.switchTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {playlistSource === 'manual' ? (
              <TextInput
                style={sheetStyles.input}
                placeholder="Tên playlist"
                placeholderTextColor={colors.textMuted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
            ) : (
              <>
                <Text style={sheetStyles.hint}>Chọn từ 2 nghệ sĩ trở lên</Text>
                <ScrollView style={sheetStyles.artistList} nestedScrollEnabled>
                  {artists.length === 0 && <Text style={sheetStyles.hint}>Chưa có nghệ sĩ nào.</Text>}
                  {artists.map((artist) => {
                    const checked = pickedArtists.includes(artist);
                    return (
                      <Pressable
                        key={artist}
                        style={sheetStyles.artistRow}
                        onPress={() => setPickedArtists((prev) => (checked ? prev.filter((a) => a !== artist) : [...prev, artist]))}
                      >
                        <Text style={[sheetStyles.artistCheck, checked && sheetStyles.artistCheckOn]}>{checked ? '☑' : '☐'}</Text>
                        <View style={sheetStyles.artistCopy}>
                          <Text style={sheetStyles.artistName} numberOfLines={1}>{artist}</Text>
                          <Text style={sheetStyles.artistCount}>{artistTrackCount([artist])} bài hát</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={sheetStyles.preview}>
                  {orderedPickedArtists.length < 2
                    ? `Đã chọn ${orderedPickedArtists.length}/2 nghệ sĩ tối thiểu.`
                    : `Tên playlist: ${orderedPickedArtists.join(' + ')} · ${artistTrackCount(orderedPickedArtists)} bài hát`}
                </Text>
              </>
            )}

            <View style={sheetStyles.dialogActions}>
              <Pressable onPress={closeCreatePlaylist}>
                <Text style={sheetStyles.cancelText}>Hủy</Text>
              </Pressable>
              <Pressable onPress={submitCreatePlaylist}>
                <Text style={sheetStyles.saveText}>Tạo</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ConfirmDialog
        visible={Boolean(confirmState)}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />

      {/* Tương đương #uploadDialog trong index.html gốc — chọn nghệ sĩ để đưa bài mới tải lên vào. */}
      <Modal
        visible={Boolean(artistPickerResolve)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          artistPickerResolve?.('');
          setArtistPickerResolve(null);
        }}
      >
        <View style={sheetStyles.dialogOverlay}>
          <View style={sheetStyles.dialog}>
            <Text style={sheetStyles.eyebrow}>UPLOAD TARGET</Text>
            <Text style={sheetStyles.dialogTitle}>Chọn nghệ sĩ</Text>
            {artists.map((artist) => (
              <Pressable
                key={artist}
                style={sheetStyles.pickerOption}
                onPress={() => {
                  artistPickerResolve?.(artist);
                  setArtistPickerResolve(null);
                }}
              >
                <Text style={sheetStyles.pickerOptionText}>{artist}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                artistPickerResolve?.('');
                setArtistPickerResolve(null);
              }}
            >
              <Text style={sheetStyles.cancelText}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.lg, paddingBottom: spacing.sm },
  brand: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' },
  brandActions: { flexDirection: 'row', gap: spacing.xs },
  iconButtonFile: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.accent },
  iconButtonFolder: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    backgroundColor: colors.accentDim,
  },
  iconButtonText: { color: colors.accent, fontSize: 14 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchIcon: { color: colors.textMuted, fontSize: 14 },
  searchInput: { flex: 1, color: colors.text, padding: 0, fontFamily: fonts.body },
  roundButton: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  roundButtonText: { color: colors.textMuted, fontSize: 16 },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: { borderColor: colors.accent },
  navIcon: { color: colors.textMuted, fontSize: 14 },
  navIconActive: { color: colors.accent },
  navLabel: { color: colors.textMuted, fontSize: 12 },
  navLabelActive: { color: colors.accent, fontWeight: '700' },
  sectionHeading: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: spacing.xs },
  sectionHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  sectionAdd: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  sidebarNote: { color: colors.textMuted, fontSize: 11, paddingVertical: spacing.xs },
  chipRow: { marginBottom: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 160,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.accent, fontWeight: '600' },
  // Nền đặc để bài hát cuộn qua phía sau không lộ ra ở khe trên/dưới thanh player khi nó dính ở top.
  stickyPlayer: { backgroundColor: colors.bg, paddingBottom: spacing.sm, zIndex: 10 },
  toolbar: { marginTop: spacing.lg, marginBottom: spacing.sm },
  heading: { color: colors.text, fontFamily: fonts.headingBold, fontSize: 20 },
  stats: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  primaryButton: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  secondaryButton: { backgroundColor: 'transparent', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text, fontSize: 13 },
  secondaryButtonActive: { borderColor: colors.accent },
  secondaryButtonTextActive: { color: colors.accent, fontWeight: '700' },
  secondaryButtonDisabled: { opacity: 0.35 },
});

const sheetStyles = StyleSheet.create({
  dialogOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  dialog: { backgroundColor: '#0b1014', borderWidth: 1, borderColor: colors.accent, padding: spacing.lg, width: '85%' },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: spacing.sm },
  dialogTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.md },
  pickerOption: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  pickerOptionText: { color: colors.text },
  input: { backgroundColor: 'transparent', color: colors.text, fontFamily: fonts.body, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.lg },
  cancelText: { color: colors.textMuted },
  switchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  switchButton: { flex: 1, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  switchButtonActive: { borderColor: colors.accent },
  switchText: { color: colors.textMuted, fontSize: 12 },
  switchTextActive: { color: colors.accent, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.xs },
  artistList: { maxHeight: 240, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderBottomWidth: 1, borderColor: colors.border },
  artistCheck: { color: colors.textMuted, fontSize: 18 },
  artistCheckOn: { color: colors.accent },
  artistCopy: { flex: 1, minWidth: 0 },
  artistName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  artistCount: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  preview: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  saveText: { color: colors.accent, fontWeight: '700' },
});
