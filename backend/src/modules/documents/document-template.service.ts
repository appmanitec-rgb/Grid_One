import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type DocumentTemplateKind =
  | 'proposal'
  | 'contract'
  | 'service-report'
  | 'work-order';

export type LoadedDocumentTemplate = {
  kind: DocumentTemplateKind;
  version: string;
  key: string;
  html: string;
  css: string;
  schema: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  rootDir: string;
};

export type InstitutionalTemplateColumn = {
  header: string;
  path: string;
  align?: 'left' | 'right' | 'center';
};

export type InstitutionalTemplateTable = {
  rowsPath: string;
  columns: InstitutionalTemplateColumn[];
  emptyText?: string;
};

export type InstitutionalTemplateSection = {
  heading?: string;
  paragraphs?: string[];
  table?: InstitutionalTemplateTable;
};

export type InstitutionalTemplateDefinition = {
  title: string;
  subtitle?: string;
  sections: InstitutionalTemplateSection[];
  footer?: string[];
};

export type LoadedInstitutionalDocumentTemplate = {
  kind: DocumentTemplateKind;
  version: string;
  key: string;
  definition: InstitutionalTemplateDefinition;
  schema: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  rootDir: string;
  docxTemplatePath?: string;
};

const DEFAULT_TEMPLATE_VERSION = 'manitec-default-v1';

@Injectable()
export class DocumentTemplateService {
  load(
    kind: DocumentTemplateKind,
    version = DEFAULT_TEMPLATE_VERSION,
  ): LoadedDocumentTemplate {
    const rootDir = this.resolveTemplateRoot(kind, version);
    const html = this.readRequired(rootDir, 'template.html');
    const css = this.readOptional(rootDir, 'style.css');
    const schema = this.readJson(rootDir, 'schema.json');
    const sampleData = this.readJson(rootDir, 'sample-data.json');

    return {
      kind,
      version,
      key: `${kind}/${version}`,
      html,
      css,
      schema,
      sampleData,
      rootDir,
    };
  }

  loadInstitutional(
    kind: DocumentTemplateKind,
    version = DEFAULT_TEMPLATE_VERSION,
  ): LoadedInstitutionalDocumentTemplate {
    const rootDir = this.resolveInstitutionalTemplateRoot(kind, version);
    const definition = this.readJsonRequired(
      rootDir,
      'template.json',
    ) as InstitutionalTemplateDefinition;
    const schema = this.readJson(rootDir, 'schema.json');
    const sampleData = this.readJson(rootDir, 'sample-data.json');
    const docxTemplatePath = this.optionalPath(rootDir, 'template.docx');

    return {
      kind,
      version,
      key: `${kind}/${version}`,
      definition,
      schema,
      sampleData,
      rootDir,
      docxTemplatePath,
    };
  }

  private resolveTemplateRoot(kind: DocumentTemplateKind, version: string) {
    for (const basePath of this.templateBasePaths()) {
      const candidate = resolve(basePath, kind, version);
      if (existsSync(candidate)) return candidate;
    }

    throw new NotFoundException(
      `Template PDF nao encontrado: ${kind}/${version}.`,
    );
  }

  private resolveInstitutionalTemplateRoot(
    kind: DocumentTemplateKind,
    version: string,
  ) {
    for (const basePath of this.institutionalTemplateBasePaths()) {
      const candidate = resolve(basePath, kind, version);
      if (existsSync(candidate)) return candidate;
    }

    throw new NotFoundException(
      `Template institucional nao encontrado: ${kind}/${version}.`,
    );
  }

  private templateBasePaths() {
    return [
      resolve(process.cwd(), 'src', 'templates', 'pdf'),
      resolve(process.cwd(), 'dist', 'src', 'templates', 'pdf'),
      resolve(process.cwd(), 'dist', 'templates', 'pdf'),
      resolve(__dirname, '..', '..', 'templates', 'pdf'),
    ];
  }

  private institutionalTemplateBasePaths() {
    return [
      resolve(process.cwd(), 'src', 'templates', 'documents'),
      resolve(process.cwd(), 'dist', 'src', 'templates', 'documents'),
      resolve(process.cwd(), 'dist', 'templates', 'documents'),
      resolve(__dirname, '..', '..', 'templates', 'documents'),
    ];
  }

  private readRequired(rootDir: string, fileName: string) {
    const path = resolve(rootDir, fileName);
    if (!existsSync(path)) {
      throw new NotFoundException(`Arquivo de template ausente: ${fileName}.`);
    }
    return readFileSync(path, 'utf8');
  }

  private readOptional(rootDir: string, fileName: string) {
    const path = resolve(rootDir, fileName);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  }

  private optionalPath(rootDir: string, fileName: string) {
    const path = resolve(rootDir, fileName);
    return existsSync(path) ? path : undefined;
  }

  private readJson(rootDir: string, fileName: string) {
    const content = this.readOptional(rootDir, fileName);
    if (!content.trim()) return {};
    return JSON.parse(content) as Record<string, unknown>;
  }

  private readJsonRequired(rootDir: string, fileName: string) {
    const content = this.readRequired(rootDir, fileName);
    return JSON.parse(content) as Record<string, unknown>;
  }
}
