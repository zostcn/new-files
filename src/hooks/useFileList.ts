import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { apiBackupList, apiBackupRecycleList } from '@/api/backup';
import type { Backup, PathNode } from '@/api/backup';
import { DIR_PAGE_SIZE, PAGE_SIZE } from '@/constants/file';
import type { NavKey, SortKey } from '@/constants/file';
import { uploadTimeOf } from '@/utils/file';

const SEARCH_DEBOUNCE = 350;

export function useFileList(o: { selectedIds: Ref<string[]> }) {
  const route = useRoute();
  const router = useRouter();

  const pathNodes = ref<PathNode[]>([]);
  const items = ref<Backup[]>([]);
  const total = ref(0);
  const pageNum = ref(1);
  const keyword = ref('');
  const loading = ref(false);
  // 默认按时间倒序 —— 最新上传的排在最前
  const sortKey = ref<SortKey>('time');
  const sortAsc = ref(false);

  // 上次真正查过的关键字，用来挡掉换目录时那次多余的防抖查询
  let lastQuery = '';

  // 缩略图加载失败的文件 id，回退成类型色块。放在这里而不是 FileIcon，
  // 否则列表/网格切换时组件重建会丢失记录，坏图反复闪
  const failedThumbs = ref<string[]>([]);

  // 路由是「当前在看哪个目录」的唯一来源，parentId 不再单独存一份，
  // 否则两份状态在前进/后退时很容易走岔
  const isTrash = computed(() => route.name === 'trash');
  const parentId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));
  const navKey = computed<NavKey>(() => (isTrash.value ? 'trash' : 'all'));

  // 只有"浏览某个目录"这一种场景拉全量；搜索和回收站的结果集上界与"一个节点"无关，
  // 继续按页取（理由见 constants/file.ts 的 DIR_PAGE_SIZE）
  const pageSize = computed(() => {
    const searching = !!keyword.value.trim();
    return !isTrash.value && !searching ? DIR_PAGE_SIZE : PAGE_SIZE;
  });

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  // pathNodes 首项恒为根节点，根目录不显示后端那个「全部文件」的名字
  const currentDirName = computed(() => {
    if (pathNodes.value.length < 2) return '根目录';
    return String(pathNodes.value[pathNodes.value.length - 1]?.name ?? '');
  });

  // 回收站的列表接口不接受排序参数，只能本地排；普通模式直接信任服务端顺序
  function sortLocal(list: Backup[]) {
    const dir = sortAsc.value ? 1 : -1;
    const byKey = (a: Backup, b: Backup) => {
      if (sortKey.value === 'size') return ((Number(a.size) || 0) - (Number(b.size) || 0)) * dir;
      if (sortKey.value === 'time') return uploadTimeOf(a).localeCompare(uploadTimeOf(b)) * dir;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-CN') * dir;
    };

    const folders = list.filter((i) => i.isDir).sort(byKey);
    const files = list.filter((i) => !i.isDir).sort(byKey);
    return [...folders, ...files];
  }

  const rows = computed(() => (isTrash.value ? sortLocal(items.value) : items.value));

  // 单击选中的「当前项」，只用来展示详情，和复选框多选互不干扰。
  // 存 id 而不是行对象：重命名后 id 不变、详情自动跟着更新，删掉后查不到、详情条自动消失
  const focusedId = ref('');
  const focusedRow = computed(() => rows.value.find((row) => row.id === focusedId.value));

  function setFocused(id: string) {
    // 双击时第一次 click 已经设过同一个值，这里挡掉多余的重渲染
    if (focusedId.value === id) return;
    focusedId.value = id;
  }

  function clearFocused() {
    focusedId.value = '';
  }

  const allSelected = computed(
    () => rows.value.length > 0 && rows.value.every((i) => o.selectedIds.value.includes(i.id ?? '')),
  );

  const selectedItems = computed(() => rows.value.filter((i) => i.id && o.selectedIds.value.includes(i.id)));

  function markThumbFailed(id?: string) {
    if (id && !failedThumbs.value.includes(id)) failedThumbs.value = [...failedThumbs.value, id];
  }

  /**
   * 请求序号，只认最后一次发出的请求的响应。
   *
   * 换目录是"改地址 → 路由监听 → load"，连点两下就会有两个请求在飞，
   * 先发的那个若返回得晚，会把后发的正确结果盖掉（列表显出上一个目录的内容）。
   * 拉全量后单个响应从几十 KB 涨到几百 KB，这个窗口跟着变宽，所以必须挡。
   */
  let loadSeq = 0;

  async function load() {
    const seq = ++loadSeq;
    loading.value = true;
    o.selectedIds.value = [];
    // 清掉当前项：否则离开目录再回来、翻页再回来时，旧 id 会重新命中、详情条自己冒出来
    focusedId.value = '';
    lastQuery = keyword.value.trim();

    try {
      if (isTrash.value) {
        const page = await apiBackupRecycleList({ pageNum: pageNum.value, pageSize: pageSize.value });
        if (seq !== loadSeq) return;
        items.value = page.items ?? [];
        total.value = page.total ?? 0;
        pathNodes.value = [];
      } else {
        const vo = await apiBackupList({
          parentId: parentId.value || undefined,
          keyword: keyword.value.trim() || undefined,
          pageNum: pageNum.value,
          pageSize: pageSize.value,
          sortBy: sortKey.value,
          sortOrder: sortAsc.value ? 'asc' : 'desc',
        });
        if (seq !== loadSeq) return;
        items.value = vo.page?.items ?? [];
        total.value = vo.page?.total ?? 0;
        pathNodes.value = vo.path ?? [];
      }
    } catch {
      // 过期请求的失败不能改状态：它可能只是被下一次导航顶掉了，而不是真的失败
      if (seq !== loadSeq) return;
      // 失败提示由请求层统一处理
      items.value = [];
      total.value = 0;
      // 直链进了一个已被彻底删除的目录时退回根目录，别停在报错的空页面
      if (!isTrash.value && parentId.value) router.replace({ name: 'home' });
    } finally {
      // 同上：还有更新的请求在飞时，loading 归它管
      if (seq === loadSeq) loading.value = false;
    }
  }

  function setSort(key: SortKey) {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value;
    } else {
      sortKey.value = key;
      sortAsc.value = true;
    }

    // 回收站是本地重排，不用请求；普通模式交给服务端，换排序要回到第一页
    if (isTrash.value) return;
    pageNum.value = 1;
    load();
  }

  /** 只勾当前这一页 —— 翻页后 rows 就换了，跨页累积没有意义 */
  function selectAll() {
    o.selectedIds.value = rows.value.map((i) => i.id ?? '').filter(Boolean);
  }

  function toggleSelectAll() {
    if (allSelected.value) o.selectedIds.value = [];
    else selectAll();
  }

  /** 只改地址，真正的加载交给路由监听，避免同一次导航发两次请求 */
  function navigate(id: string) {
    // 面包屑首项恒为根节点（id 0），归一化成 / 而不是 /folder/0，
    // 免得同一个根目录占两条历史记录
    const target = id && id !== '0' ? id : '';
    const to = target ? { name: 'folder', params: { id: target } } : { name: 'home' };

    // 已经在这个地址上时 router.push 是空操作、路由监听不会触发，
    // 于是「在根目录里搜索时点根目录/Logo」会毫无反应 —— 手动清掉搜索并重新加载
    if (router.resolve(to).fullPath === route.fullPath) {
      keyword.value = '';
      pageNum.value = 1;
      load();
      return;
    }

    router.push(to);
  }

  function openFolder(item: Backup) {
    // 回收站里的条目不可进入
    if (!item.isDir || isTrash.value) return;
    navigate(item.id ?? '');
  }

  function goToPath(id: string) {
    navigate(id);
  }

  function selectNav(key: NavKey) {
    router.push(key === 'trash' ? { name: 'trash' } : { name: 'home' });
  }

  function goPage(n: number) {
    if (n < 1 || n > totalPages.value || n === pageNum.value) return;
    pageNum.value = n;
    load();
  }

  // 路由变化（含首次进入）就是「换了个目录」，重新加载
  watch(
    () => route.fullPath,
    () => {
      pageNum.value = 1;
      keyword.value = '';
      load();
    },
    { immediate: true },
  );

  // 搜索走后端全局匹配，防抖后重查
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  watch(keyword, () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (keyword.value.trim() === lastQuery) return;
      pageNum.value = 1;
      load();
    }, SEARCH_DEBOUNCE);
  });

  return {
    navKey,
    parentId,
    pathNodes,
    items,
    total,
    pageNum,
    keyword,
    loading,
    sortKey,
    sortAsc,
    failedThumbs,
    isTrash,
    pageSize,
    totalPages,
    currentDirName,
    rows,
    allSelected,
    selectedItems,
    focusedRow,
    setFocused,
    clearFocused,
    markThumbFailed,
    load,
    setSort,
    selectAll,
    toggleSelectAll,
    openFolder,
    goToPath,
    selectNav,
    goPage,
  };
}
