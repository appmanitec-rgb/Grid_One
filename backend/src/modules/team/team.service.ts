import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

const authorSelect = {
  id: true,
  name: true,
  role: true,
  profilePhotoUrl: true,
} as const;

@Injectable()
export class TeamService {
  constructor(private readonly prisma: DatabaseService) {}

  private async actor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        isSystemMaster: true,
      },
    });
    if (!user || !user.isActive || user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Área exclusiva da equipe interna.');
    }
    return user;
  }

  private canModerate(actor: { role: UserRole; isSystemMaster: boolean }) {
    return (
      actor.isSystemMaster ||
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.MANAGER
    );
  }

  private authorView(
    author: {
      id: string;
      name: string;
      role: UserRole;
      profilePhotoUrl: string | null;
    } | null,
    authorName: string,
  ) {
    return (
      author ?? {
        id: '',
        name: authorName,
        role: 'FORMER',
        profilePhotoUrl: null,
      }
    );
  }

  private cleanBody(body: string, max: number) {
    const cleaned = body?.trim();
    if (!cleaned || cleaned.length > max) {
      throw new BadRequestException(
        `Informe um texto de 1 a ${max} caracteres.`,
      );
    }
    return cleaned;
  }

  private pageSize(
    value: string | undefined,
    maximum: number,
    fallback: number,
  ) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0
      ? Math.min(parsed, maximum)
      : fallback;
  }

  async feed(userId: string, cursor?: string, limit?: string) {
    const actor = await this.actor(userId);
    const take = this.pageSize(limit, 30, 15);
    const rows = await this.prisma.teamPost.findMany({
      where: { deletedAt: null },
      orderBy: [{ pinnedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: authorSelect },
        _count: { select: { comments: true, reactions: true } },
        reactions: { where: { userId }, select: { userId: true } },
        comments: {
          take: 2,
          orderBy: { createdAt: 'desc' },
          include: { author: { select: authorSelect } },
        },
      },
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take);
    return {
      items: page.map((post) => ({
        id: post.id,
        body: post.body,
        author: this.authorView(post.author, post.authorName),
        pinnedAt: post.pinnedAt,
        editedAt: post.editedAt,
        createdAt: post.createdAt,
        reactionCount: post._count.reactions,
        commentCount: post._count.comments,
        likedByMe: post.reactions.length > 0,
        canEdit: post.authorId === userId,
        canDelete: post.authorId === userId || this.canModerate(actor),
        comments: post.comments.reverse().map((comment) => ({
          id: comment.id,
          body: comment.body,
          author: this.authorView(comment.author, comment.authorName),
          createdAt: comment.createdAt,
          canDelete: comment.authorId === userId || this.canModerate(actor),
        })),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      canModerate: this.canModerate(actor),
    };
  }

  async createPost(userId: string, body: string) {
    const actor = await this.actor(userId);
    return this.prisma.teamPost.create({
      data: {
        authorId: userId,
        authorName: actor.name,
        body: this.cleanBody(body, 5000),
      },
      include: { author: { select: authorSelect } },
    });
  }

  async updatePost(userId: string, id: string, body: string) {
    await this.actor(userId);
    const post = await this.prisma.teamPost.findUnique({ where: { id } });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    if (post.authorId !== userId)
      throw new ForbiddenException('Você só pode editar suas publicações.');
    return this.prisma.teamPost.update({
      where: { id },
      data: { body: this.cleanBody(body, 5000), editedAt: new Date() },
    });
  }

  async deletePost(userId: string, id: string) {
    const actor = await this.actor(userId);
    const post = await this.prisma.teamPost.findUnique({ where: { id } });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    if (post.authorId !== userId && !this.canModerate(actor)) {
      throw new ForbiddenException('Você não pode remover esta publicação.');
    }
    await this.prisma.teamPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async togglePin(userId: string, id: string) {
    const actor = await this.actor(userId);
    if (!this.canModerate(actor))
      throw new ForbiddenException('Apenas gestores podem fixar avisos.');
    const post = await this.prisma.teamPost.findUnique({ where: { id } });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    return this.prisma.teamPost.update({
      where: { id },
      data: { pinnedAt: post.pinnedAt ? null : new Date() },
    });
  }

  async toggleReaction(userId: string, postId: string) {
    await this.actor(userId);
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    const key = { postId_userId: { postId, userId } };
    const existing = await this.prisma.teamPostReaction.findUnique({
      where: key,
    });
    if (existing) {
      await this.prisma.teamPostReaction.delete({ where: key });
    } else {
      await this.prisma.teamPostReaction.create({ data: { postId, userId } });
    }
    return {
      likedByMe: !existing,
      reactionCount: await this.prisma.teamPostReaction.count({
        where: { postId },
      }),
    };
  }

  async comments(
    userId: string,
    postId: string,
    cursor?: string,
    limit?: string,
  ) {
    const actor = await this.actor(userId);
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    const take = this.pageSize(limit, 50, 20);
    const rows = await this.prisma.teamPostComment.findMany({
      where: { postId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { author: { select: authorSelect } },
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take);
    return {
      items: page.reverse().map((comment) => ({
        id: comment.id,
        body: comment.body,
        author: this.authorView(comment.author, comment.authorName),
        createdAt: comment.createdAt,
        canDelete: comment.authorId === userId || this.canModerate(actor),
      })),
      nextCursor: hasMore ? page[0].id : null,
    };
  }

  async createComment(userId: string, postId: string, body: string) {
    const actor = await this.actor(userId);
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.deletedAt)
      throw new NotFoundException('Publicação não encontrada.');
    return this.prisma.teamPostComment.create({
      data: {
        postId,
        authorId: userId,
        authorName: actor.name,
        body: this.cleanBody(body, 1000),
      },
      include: { author: { select: authorSelect } },
    });
  }

  async deleteComment(userId: string, id: string) {
    const actor = await this.actor(userId);
    const comment = await this.prisma.teamPostComment.findUnique({
      where: { id },
    });
    if (!comment) throw new NotFoundException('Comentário não encontrado.');
    if (comment.authorId !== userId && !this.canModerate(actor)) {
      throw new ForbiddenException('Você não pode remover este comentário.');
    }
    await this.prisma.teamPostComment.delete({ where: { id } });
    return { ok: true };
  }

  async channels(userId: string) {
    await this.actor(userId);
    const channels = await this.prisma.teamChannel.findMany({
      where: { isArchived: false },
      orderBy: { name: 'asc' },
      include: {
        reads: { where: { userId }, select: { lastReadAt: true } },
        messages: {
          where: { deletedAt: null },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            body: true,
            createdAt: true,
            authorName: true,
            author: { select: authorSelect },
          },
        },
      },
    });
    return Promise.all(
      channels.map(async (channel) => ({
        id: channel.id,
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        unreadCount: await this.prisma.teamMessage.count({
          where: {
            channelId: channel.id,
            deletedAt: null,
            authorId: { not: userId },
            ...(channel.reads[0]
              ? { createdAt: { gt: channel.reads[0].lastReadAt } }
              : {}),
          },
        }),
        lastMessage: channel.messages[0]
          ? {
              ...channel.messages[0],
              author: this.authorView(
                channel.messages[0].author,
                channel.messages[0].authorName,
              ),
            }
          : null,
      })),
    );
  }

  async createChannel(userId: string, name: string, description?: string) {
    const actor = await this.actor(userId);
    if (!this.canModerate(actor))
      throw new ForbiddenException('Apenas gestores podem criar canais.');
    const cleanName = name?.trim();
    const slug = cleanName
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!cleanName || cleanName.length > 40 || !slug) {
      throw new BadRequestException('Informe um nome válido para o canal.');
    }
    const existing = await this.prisma.teamChannel.findUnique({
      where: { slug },
    });
    if (existing)
      throw new ConflictException('Já existe um canal com este nome.');
    return this.prisma.teamChannel.create({
      data: {
        name: cleanName,
        slug,
        description: description?.trim() || null,
        createdByUserId: userId,
      },
    });
  }

  private async channel(id: string) {
    const channel = await this.prisma.teamChannel.findUnique({ where: { id } });
    if (!channel || channel.isArchived)
      throw new NotFoundException('Canal não encontrado.');
    return channel;
  }

  async messages(
    userId: string,
    channelId: string,
    before?: string,
    limit?: string,
  ) {
    const actor = await this.actor(userId);
    await this.channel(channelId);
    const take = this.pageSize(limit, 100, 50);
    const rows = await this.prisma.teamMessage.findMany({
      where: { channelId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: { author: { select: authorSelect } },
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take);
    return {
      items: page.reverse().map((message) => ({
        id: message.id,
        body: message.body,
        author: this.authorView(message.author, message.authorName),
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        canEdit: message.authorId === userId,
        canDelete: message.authorId === userId || this.canModerate(actor),
      })),
      nextCursor: hasMore ? page[0].id : null,
    };
  }

  async sendMessage(userId: string, channelId: string, body: string) {
    const actor = await this.actor(userId);
    await this.channel(channelId);
    return this.prisma.teamMessage.create({
      data: {
        channelId,
        authorId: userId,
        authorName: actor.name,
        body: this.cleanBody(body, 2000),
      },
      include: { author: { select: authorSelect } },
    });
  }

  async updateMessage(userId: string, id: string, body: string) {
    await this.actor(userId);
    const message = await this.prisma.teamMessage.findUnique({ where: { id } });
    if (!message || message.deletedAt)
      throw new NotFoundException('Mensagem não encontrada.');
    if (message.authorId !== userId)
      throw new ForbiddenException('Você só pode editar suas mensagens.');
    return this.prisma.teamMessage.update({
      where: { id },
      data: { body: this.cleanBody(body, 2000), editedAt: new Date() },
    });
  }

  async deleteMessage(userId: string, id: string) {
    const actor = await this.actor(userId);
    const message = await this.prisma.teamMessage.findUnique({ where: { id } });
    if (!message || message.deletedAt)
      throw new NotFoundException('Mensagem não encontrada.');
    if (message.authorId !== userId && !this.canModerate(actor)) {
      throw new ForbiddenException('Você não pode remover esta mensagem.');
    }
    await this.prisma.teamMessage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async markRead(userId: string, channelId: string) {
    await this.actor(userId);
    await this.channel(channelId);
    await this.prisma.teamChannelRead.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }
}
