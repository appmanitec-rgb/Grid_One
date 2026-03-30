export enum ItemType {
  PART = 'PART',
  SERVICE = 'SERVICE',
}

export class CatalogItem {
  // O uso do '!' (Definite Assignment Assertion) avisa ao TypeScript
  // que o ORM (ex: TypeORM/Prisma) vai injetar esses dados.

  id!: string;
  name!: string;
  description?: string; // O '?' indica que é opcional, então não precisa do '!'
  sku?: string; // Opcional
  price!: number;
  cost!: number;
  type!: ItemType;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
