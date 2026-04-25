export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
    execute: (params: any) => Promise<any>;
}
//# sourceMappingURL=types.d.ts.map