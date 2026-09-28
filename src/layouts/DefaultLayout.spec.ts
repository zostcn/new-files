import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from "vue-router";
import DefaultLayout from "./DefaultLayout.vue";

/**
 * 项目已按需求移除模板顶栏(2026-09-29)—— 本文件从「导航派生锁」改为
 * **反向锁**:顶栏不许回来(站名/导航/退出按钮全无),以及全高容器契约
 * (`h-screen`:文件区 `.fm` 的 `height:100%` 靠它解析,缺了就不满屏)。
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: DefaultLayout,
    children: [{ path: "", component: { template: "<div>page-content</div>" } }],
  },
];

async function mountLayout() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.push("/");
  await router.isReady();
  const wrapper = mount(DefaultLayout, {
    global: { plugins: [router] },
  });
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe("DefaultLayout(无顶栏形态)", () => {
  it("只渲染子路由,不输出模板顶栏(zost 站名/导航/退出)", async () => {
    const { wrapper } = await mountLayout();
    expect(wrapper.text()).toContain("page-content");
    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("zost");
    expect(wrapper.text()).not.toContain("退出");
  });

  it("容器是全高(h-screen)且裁掉外溢 —— .fm 的 height:100% 靠它解析", async () => {
    const { wrapper } = await mountLayout();
    expect(wrapper.classes()).toContain("h-screen");
    expect(wrapper.classes()).toContain("overflow-hidden");
  });
});
