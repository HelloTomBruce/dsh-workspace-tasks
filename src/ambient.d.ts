declare module "@deepseek-ai/cordis" {
  export interface Context {
    tools?: {
      register: (tool: any) => () => void;
    };
    webServer?: {
      register: (spec: any) => () => void;
    };
    systemPrompt?: {
      section: (spec: any) => () => void;
    };
    [key: string]: any;
  }
}

declare module "@deepseek-ai/dsh-client-runtime/client" {
  export interface ClientContext {
    effect: (fn: () => void | (() => void), name?: string) => void;
    slots: {
      inject: (name: string, callback: () => any) => void;
      register: (spec: any, component: any) => any;
      [key: string]: any;
    };
    sidebarRight?: {
      openTab?: (kind: string, options?: any) => void;
      [key: string]: any;
    };
    sidebarRightTabs?: {
      register: (definition: any) => () => void;
    };
    [key: string]: any;
  }
}
