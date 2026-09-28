<script setup lang="ts">
/**
 * 布局壳。模板原带的顶栏(站名/导航派生/退出按钮)已按需求**整层移除**
 * (2026-09-29):本项目是文件管理工具,工具栏、回收站与退出都在
 * `pages/files` 自己的 HomeToolbar + UserMenu 里,再挂一层只会重复。
 * 想恢复顶栏:从 cli 模板拷回 DefaultLayout + 路由的 meta.title。
 *
 * `h-screen overflow-hidden` 是**高度链**的关键(实测:缺它时页面不满屏):
 * 文件区 `.fm` 是 `height: 100%`,百分比要有确定高度的父级才解析——
 * 模板原来用 `min-h-screen`(min-height 不提供确定高度),`.fm` 会塌掉。
 * 滚动交给文件区内部,页面不出现第二条滚动条。
 */
</script>

<template>
  <div class="h-screen overflow-hidden bg-bg text-fg">
    <RouterView />
  </div>
</template>
