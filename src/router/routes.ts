import DefaultLayout from "@/layouts/DefaultLayout.vue";
import DevicesPage from "@/pages/DevicesPage.vue";
import FilesPage from "@/pages/files/index.vue";
import LoginPage from "@/pages/LoginPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RegisterPage from "@/pages/RegisterPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import type { RouteRecordRaw } from "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    /** 公开页:匿名可进(仍会先 bootstrap 拿 csrfToken —— 见 guard ①)。 */
    public?: boolean;
    /** 需要登录。 */
    requiresAuth?: boolean;
    /** 允许进入的**角色**;写在父级则整组受约束。不写 = 登录即可。 */
    roles?: string[];
    /** 导航标题 —— **写了才进顶栏导航**(DefaultLayout 从路由树派生,B6)。 */
    title?: string;
  }
}

/**
 * 手写路由(H14:模板打开就能看懂,不引 unplugin-vue-router)。
 *
 * **初始只注册公开路由** —— 守卫树等登录后按角色过滤再注入(见 guard ④)。
 * 菜单也从这棵树派生(B6):`meta.roles` 只写一处,别再维护第二份菜单配置。
 *
 * ⚠️ catch-all **刻意不标 `public`**:注入前 `/` 之类的守卫目标都会先被它
 * 解析掉,标了 public 守卫就在第②步放行、永远到不了第④步(实测红过 3 条)。
 * 不标则匿名访问未知路径走第③步 → /login,登录后进来才看到 404。
 */
export const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: LoginPage,
    meta: { public: true },
  },
  // 注册与登录同为公开页(后端 /api/auth/register 在 PUBLIC)
  {
    path: "/register",
    name: "register",
    component: RegisterPage,
    meta: { public: true },
  },
  { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundPage },
];

/** 守卫树。项目在这里加子路由;`meta.roles` 写在父级即约束整组。 */
export const guardedRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "root",
    component: DefaultLayout,
    meta: { requiresAuth: true },
    children: [
      // 首页不写 title:站名(顶栏左侧)就是它的入口,导航里再放一个「首页」是重复。
      // new-files 是文件管理工具:根路径直接是文件列表(旧 files 的 `/`),
      // meta.roles=admin 与后端 /api/file/** 的 RBAC 门禁对齐 —— 不写的话
      // 普通用户能进页面但每个请求都 403,不如在路由层就挡住。
      { path: "", name: "home", component: FilesPage, meta: { roles: ["admin"] } },
      // 旧 files 的两条真实路由(分享/后退靠真实历史,见 index.vue 的路由写法)
      {
        path: "folder/:id",
        name: "folder",
        component: FilesPage,
        meta: { roles: ["admin"] },
      },
      {
        path: "trash",
        name: "trash",
        component: FilesPage,
        meta: { roles: ["admin"] },
      },
      // 信任设备管理(§1.12)。**不写 meta.roles = 登录即可** ——
      // 与后端「未入册路径登录即可」的授权语义一致。
      {
        path: "devices",
        name: "devices",
        component: DevicesPage,
        meta: { title: "信任设备" },
      },
      // 账号安全(改密码)。同样登录即可;与 devices 一起构成「账号安全」落点。
      {
        path: "settings",
        name: "settings",
        component: SettingsPage,
        meta: { title: "账号安全" },
      },
    ],
  },
];
