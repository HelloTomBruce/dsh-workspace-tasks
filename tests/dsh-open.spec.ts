import { describe, it, expect, vi } from "vitest";
import {
  sessionFileAddress,
  absoluteFileAddress,
  resolveWorkspacePath,
  fileAddressFor,
  findCurrentSession,
  openWorkspaceFileViaDsh,
} from "../src/client/dsh-open";

describe("dsh-open 资源与路径协议", () => {
  it("sessionFileAddress 应当生成标准的 session 文件资源 URI", () => {
    const uri = sessionFileAddress("s-123", "docs/spec.md");
    expect(uri).toBe("dsh-resource://file/session/s-123/docs/spec.md");

    // 包含空格和特殊字符应当逐段 URI 编码
    const uriSpecial = sessionFileAddress("s-123", "my reports/summary #1.txt");
    expect(uriSpecial).toBe("dsh-resource://file/session/s-123/my%20reports/summary%20%231.txt");

    // Windows 反斜杠应当规范化为正斜杠，并移除开头的 ./
    const uriWin = sessionFileAddress("s-123", ".\\src\\index.ts");
    expect(uriWin).toBe("dsh-resource://file/session/s-123/src/index.ts");
  });

  it("absoluteFileAddress 应当生成标准的 absolute 文件资源 URI", () => {
    const uriPosix = absoluteFileAddress("/home/user/project/file.txt");
    expect(uriPosix).toBe("dsh-resource://file/absolute/home/user/project/file.txt");

    const uriWin = absoluteFileAddress("C:/Users/project/file.txt");
    expect(uriWin).toBe("dsh-resource://file/absolute/C:/Users/project/file.txt");
  });

  it("fileAddressFor 应当将相对路径与工作区路径正确转换为 Session 资源 URI", () => {
    const cwd = "/Users/zhangbei/code/my-app";

    // 相对路径
    const addr1 = fileAddressFor("s-1", cwd, "src/main.ts");
    expect(addr1).toBe("dsh-resource://file/session/s-1/src/main.ts");

    // 工作区内的绝对路径 -> 自动转换为工作区相对路径
    const addr2 = fileAddressFor("s-1", cwd, "/Users/zhangbei/code/my-app/src/main.ts");
    expect(addr2).toBe("dsh-resource://file/session/s-1/src/main.ts");

    // 工作区根目录自身
    const addr3 = fileAddressFor("s-1", cwd, "/Users/zhangbei/code/my-app");
    expect(addr3).toBe("dsh-resource://file/session/s-1/");
  });

  it("resolveWorkspacePath 应当正确拼接相对路径或直接返回绝对路径", () => {
    expect(resolveWorkspacePath("/app", "src/index.ts")).toBe("/app/src/index.ts");
    expect(resolveWorkspacePath("/app", "/var/log/app.log")).toBe("/var/log/app.log");
    expect(resolveWorkspacePath(undefined, "src/index.ts")).toBe("src/index.ts");
  });

  it("findCurrentSession 应当优先找到 mainView > 0 的当前展示会话", () => {
    const mockCtx = {
      sessions: {
        list: {
          getSnapshot: () => ({
            byId: {
              "s-inactive": { sessionId: "s-inactive", cwd: "/code/old", updatedAt: 200, retainedBy: { mainView: 0 } },
              "s-active": { sessionId: "s-active", cwd: "/code/active", updatedAt: 100, retainedBy: { mainView: 1 } },
            },
          }),
        },
      },
    };

    const session = findCurrentSession(mockCtx);
    expect(session).toEqual({ sessionId: "s-active", cwd: "/code/active" });
  });

  it("findCurrentSession 在无 mainView 时应当回退到 updatedAt 最近的会话", () => {
    const mockCtx = {
      sessions: {
        list: {
          getSnapshot: () => ({
            byId: {
              "s-1": { sessionId: "s-1", cwd: "/code/1", updatedAt: 100 },
              "s-2": { sessionId: "s-2", cwd: "/code/2", updatedAt: 300 },
            },
          }),
        },
      },
    };

    const session = findCurrentSession(mockCtx);
    expect(session).toEqual({ sessionId: "s-2", cwd: "/code/2" });
  });
});

describe("openWorkspaceFileViaDsh 打开机制", () => {
  it("首选方案：应当通过当前 Tab 注入的 tabActions.openResource 打开 DSH 文件资源", async () => {
    const openResourceMock = vi.fn();
    const mockCtx = {
      sidebarRight: { openResource: vi.fn() },
    };

    await openWorkspaceFileViaDsh(mockCtx, "README.md", {
      sessionId: "sess-abc",
      workspacePath: "/repo",
      tabActions: { openResource: openResourceMock },
    });

    expect(openResourceMock).toHaveBeenCalledWith(
      "dsh-resource://file/session/sess-abc/README.md",
      undefined
    );
    // 优先使用了 tabActions，不应再重复调用 sidebarRight
    expect(mockCtx.sidebarRight.openResource).not.toHaveBeenCalled();
  });

  it("次选方案：无 tabActions 时应当通过全局 sidebarRight.openResource 打开", async () => {
    const globalOpenResource = vi.fn();
    const mockCtx = {
      sidebarRight: { openResource: globalOpenResource },
      sessions: {
        list: {
          getSnapshot: () => ({
            byId: {
              "sess-current": { sessionId: "sess-current", cwd: "/my-proj", retainedBy: { mainView: 1 } },
            },
          }),
        },
      },
    };

    await openWorkspaceFileViaDsh(mockCtx, "docs/arch.png");

    expect(globalOpenResource).toHaveBeenCalledWith(
      "dsh-resource://file/session/sess-current/docs/arch.png",
      undefined
    );
  });

  it("支持传递指定行号参数", async () => {
    const openResourceMock = vi.fn();
    await openWorkspaceFileViaDsh({}, "src/index.ts", {
      sessionId: "s1",
      line: 42,
      tabActions: { openResource: openResourceMock },
    });

    expect(openResourceMock).toHaveBeenCalledWith(
      "dsh-resource://file/session/s1/src/index.ts",
      { params: { line: 42 } }
    );
  });

  it("在完全无 session 时回退到 absoluteFileAddress 并调用 sidebarRight.openResource", async () => {
    const globalOpenResource = vi.fn();
    const mockCtx = {
      sidebarRight: { openResource: globalOpenResource },
      sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    };

    await openWorkspaceFileViaDsh(mockCtx, "output.txt", { workspacePath: "/Users/test/workspace" });

    expect(globalOpenResource).toHaveBeenCalledWith(
      "dsh-resource://file/absolute/Users/test/workspace/output.txt",
      undefined
    );
  });
});
