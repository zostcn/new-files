/**
 * 把拖入/选中的目录树摊平成后端 /backup/upload-folder 需要的形状：
 * 一堆文件 + 每个文件的相对路径 + 需要保留的空目录。
 */

export interface UploadTree {
  files: Array<{ file: File; path: string }>;
  /** 需要保留的空目录相对路径 */
  emptyDirs: string[];
}

/**
 * 同步取出拖拽内容里的文件系统条目。
 * 必须在 await 之前调用 —— dataTransfer.items 在事件处理器返回后即失效，
 * 先 await 再读会拿到空列表，是这类拖拽上传最常见的丢数据原因。
 */
export function droppedEntries(e: DragEvent): FileSystemEntry[] {
  return Array.from(e.dataTransfer?.items ?? [])
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => !!entry);
}

const readBatch = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

function isDirEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

/** 丢掉空段与 . / .. ，防止相对路径逃出目标目录 */
function safePath(segments: string[]) {
  return segments.filter((s) => s && s !== '.' && s !== '..').join('/');
}

async function walk(entry: FileSystemEntry, prefix: string[], tree: UploadTree) {
  const segments = [...prefix, entry.name];

  if (isDirEntry(entry)) {
    const children: FileSystemEntry[] = [];
    // readEntries 是分批返回的，必须一直读到空数组为止；只调一次会静默丢文件
    const reader = entry.createReader();
    let batch: FileSystemEntry[];
    do {
      batch = await readBatch(reader);
      children.push(...batch);
    } while (batch.length);

    if (!children.length) {
      tree.emptyDirs.push(safePath(segments));
      return;
    }

    await Promise.all(children.map((child) => walk(child, segments, tree)));
    return;
  }

  const file = await fileOf(entry as FileSystemFileEntry);
  tree.files.push({ file, path: safePath(segments) });
}

/** 单个拖入的条目（文件或文件夹）；文件夹的名字会作为路径的第一段 */
export async function entryToTree(entry: FileSystemEntry): Promise<UploadTree> {
  const tree: UploadTree = { files: [], emptyDirs: [] };
  await walk(entry, [], tree);
  return tree;
}

export async function entriesToTree(entries: FileSystemEntry[]): Promise<UploadTree> {
  const trees = await Promise.all(entries.map((entry) => entryToTree(entry)));

  return {
    files: trees.flatMap((t) => t.files),
    emptyDirs: trees.flatMap((t) => t.emptyDirs),
  };
}

/** <input webkitdirectory> 选中的文件，webkitRelativePath 本身就带根目录名 */
export function filesFromInput(files: File[]): UploadTree {
  const tree: UploadTree = { files: [], emptyDirs: [] };

  for (const file of files) {
    const path = file.webkitRelativePath ? safePath(file.webkitRelativePath.split('/')) : file.name;
    tree.files.push({ file, path });
  }

  return tree;
}
