import { Injectable } from '@nestjs/common';

type RenderContext = Record<string, unknown>;

@Injectable()
export class TemplateRendererService {
  render(template: string, context: RenderContext) {
    const withLoops = this.renderLoops(template, context);
    return this.renderVariables(withLoops, context);
  }

  private renderLoops(template: string, context: RenderContext) {
    return template.replace(
      /{{#each\s+([\w.]+)}}([\s\S]*?){{\/each}}/g,
      (_match, path: string, block: string) => {
        const value = this.resolvePath(path, context);
        if (!Array.isArray(value)) return '';

        return value
          .map((item) => {
            const local =
              item && typeof item === 'object'
                ? ({ ...context, ...(item as RenderContext), this: item } as
                    | RenderContext
                    | Record<string, unknown>)
                : ({ ...context, this: item } as RenderContext);
            return this.renderVariables(block, local as RenderContext);
          })
          .join('');
      },
    );
  }

  private renderVariables(template: string, context: RenderContext) {
    return template.replace(
      /{{\s*([\w.[\]]+(?:\.[\w.[\]]+)*)\s*}}/g,
      (_match, path: string) =>
        this.escapeHtml(this.stringify(this.resolvePath(path, context))),
    );
  }

  private resolvePath(path: string, context: RenderContext) {
    const normalized = path.replace(/\[(\d+)\]/g, '.$1');
    return normalized.split('.').reduce<unknown>((current, segment) => {
      if (segment === 'this') return current ?? context.this;
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      if (segment in context) return context[segment];
      return undefined;
    }, context);
  }

  private stringify(value: unknown) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
