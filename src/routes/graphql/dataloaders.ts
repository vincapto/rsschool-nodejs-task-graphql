import { PrismaClient, User, Post, Profile, MemberType } from '@prisma/client';
import DataLoader from 'dataloader';

export interface Loaders {
  postsByAuthorId: DataLoader<string, Post[]>;
  userSubscribedTo: DataLoader<string, User[]>;
  subscribedToUser: DataLoader<string, User[]>;
  memberTypeById: DataLoader<string, MemberType | null>;
  profileByUserId: DataLoader<string, Profile | null>;
}

export function createLoaders(prisma: PrismaClient): Loaders {
  return {
    postsByAuthorId: new DataLoader<string, Post[]>(async (userIds) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: userIds as string[] } },
      });
      return userIds.map((id) => posts.filter((p) => p.authorId === id));
    }),

    userSubscribedTo: new DataLoader<string, User[]>(async (userIds) => {
      const subs = await prisma.subscribersOnAuthors.findMany({
        where: { subscriberId: { in: userIds as string[] } },
      });

      const authorIds = Array.from(new Set(subs.map((s) => s.authorId)));

      const users = await prisma.user.findMany({ where: { id: { in: authorIds } } });
      const userMap = new Map(users.map((u) => [u.id, u]));

      const resultMap = new Map<string, User[]>();
      userIds.forEach((id) => resultMap.set(id, []));

      for (const sub of subs) {
        const author = userMap.get(sub.authorId);
        if (author) {
          resultMap.get(sub.subscriberId)?.push(author);
        }
      }

      return userIds.map((id) => resultMap.get(id) ?? []);
    }),

    subscribedToUser: new DataLoader<string, User[]>(async (userIds) => {
      const subs = await prisma.subscribersOnAuthors.findMany({
        where: { authorId: { in: userIds as string[] } },
      });

      const subscriberIds = Array.from(new Set(subs.map((s) => s.subscriberId)));

      const users = await prisma.user.findMany({ where: { id: { in: subscriberIds } } });
      const userMap = new Map(users.map((u) => [u.id, u]));

      const resultMap = new Map<string, User[]>();
      userIds.forEach((id) => resultMap.set(id, []));

      for (const sub of subs) {
        const subscriber = userMap.get(sub.subscriberId);
        if (subscriber) {
          resultMap.get(sub.authorId)?.push(subscriber);
        }
      }

      return userIds.map((id) => resultMap.get(id) ?? []);
    }),

    memberTypeById: new DataLoader<string, MemberType | null>(async (ids) => {
      const types = await prisma.memberType.findMany({
        where: { id: { in: ids as string[] } },
      });
      const map = new Map(types.map((t) => [t.id, t]));
      return ids.map((id) => map.get(id) ?? null);
    }),

    profileByUserId: new DataLoader<string, Profile | null>(async (userIds) => {
      const profiles = await prisma.profile.findMany({
        where: { userId: { in: userIds as string[] } },
      });
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));
      return userIds.map((id) => profileMap.get(id) ?? null);
    }),
  };
}

export interface UserWithRelationships extends User {
  userSubscribedTo?: Array<{ authorId: string }>;
  subscribedToUser?: Array<{ subscriberId: string }>;
  profile?: Profile | null;
}

export function primeUserRelationshipLoaders(
  users: UserWithRelationships[],
  userMap: Map<string, User>,
  loaders: Loaders,
  include: { userSubscribedTo?: boolean; subscribedToUser?: boolean; profile?: boolean },
): void {
  users.forEach((u) => {
    loaders.userSubscribedTo.clear(u.id).prime(u.id, []);
    loaders.subscribedToUser.clear(u.id).prime(u.id, []);
  });

  if (include.userSubscribedTo) {
    users.forEach((u) => {
      const rels = u.userSubscribedTo ?? [];
      const subs = rels.map((rel) => userMap.get(rel.authorId)).filter(Boolean) as User[];
      loaders.userSubscribedTo.clear(u.id).prime(u.id, subs);
    });
  }

  if (include.subscribedToUser) {
    users.forEach((u) => {
      const rels = u.subscribedToUser ?? [];
      const subs = rels
        .map((rel) => userMap.get(rel.subscriberId))
        .filter(Boolean) as User[];
      loaders.subscribedToUser.clear(u.id).prime(u.id, subs);
    });
  }

  if (include.profile) {
    users.forEach((u) => {
      if (u.profile) {
        loaders.profileByUserId.clear(u.id).prime(u.id, u.profile);
      }
    });
  }
}
