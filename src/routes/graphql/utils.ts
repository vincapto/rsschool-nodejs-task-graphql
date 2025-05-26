import { Profile, User, PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';
import { GraphQLResolveInfo } from 'graphql';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { UserWithRelationships } from './dataloaders.js';

export interface ParsedFields {
  userSubscribedTo?: boolean;
  subscribedToUser?: boolean;
  profile?: boolean;
}

export function parseFields(info: GraphQLResolveInfo): ParsedFields {
  const parsed = parseResolveInfo(info);
  const include: ParsedFields = {};

  if (
    parsed &&
    'fieldsByTypeName' in parsed &&
    parsed.fieldsByTypeName &&
    'User' in parsed.fieldsByTypeName &&
    parsed.fieldsByTypeName.User
  ) {
    const fields = parsed.fieldsByTypeName.User;
    if ('userSubscribedTo' in fields) include.userSubscribedTo = true;
    if ('subscribedToUser' in fields) include.subscribedToUser = true;
    if ('profile' in fields) include.profile = true;
  }

  return include;
}

export function primeLoader<K, V, T extends { id: K }>(
  loader: DataLoader<K, V>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V | undefined,
  items: T[],
): void {
  items.forEach((item) => {
    const key = keyFn(item);
    const value = valueFn(item);
    if (value !== undefined) {
      loader.clear(key).prime(key, value);
    }
  });
}

export function mapRelationships<T, I extends { id: string }>(
  items: I[],
  relationField: string,
  targetIdField: string,
  entityMap: Map<string, T>,
): Map<string, T[]> {
  const resultMap = new Map<string, T[]>();

  items.forEach((item) => {
    resultMap.set(item.id, []);
  });

  items.forEach((item) => {
    const relationships =
      (item[relationField as keyof I] as unknown as
        | Array<Record<string, string>>
        | undefined) ?? [];
    const relatedItems = relationships
      .map((rel) => entityMap.get(rel[targetIdField]))
      .filter(Boolean) as T[];

    resultMap.set(item.id, relatedItems);
  });

  return resultMap;
}

export function primeUserRelationshipLoaders(
  users: UserWithRelationships[],
  loaders: {
    userSubscribedTo: DataLoader<string, User[]>;
    subscribedToUser: DataLoader<string, User[]>;
  },
  include: ParsedFields,
): void {
  const userMap = new Map(users.map((u) => [u.id, u]));

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
}

export function primeProfileLoader(
  users: UserWithRelationships[],
  profileLoader: DataLoader<string, Profile | null>,
  includeProfile: boolean,
): void {
  if (includeProfile) {
    users.forEach((u) => {
      if (u.profile) {
        profileLoader.clear(u.id).prime(u.id, u.profile);
      }
    });
  }
}

export async function getUsersWithRelationships(
  prisma: PrismaClient,
  info: GraphQLResolveInfo,
  loaders: {
    userSubscribedTo: DataLoader<string, User[]>;
    subscribedToUser: DataLoader<string, User[]>;
    profileByUserId: DataLoader<string, Profile | null>;
  },
): Promise<User[]> {
  const include = parseFields(info);

  if (Object.keys(include).length) {
    const users = (await prisma.user.findMany({
      include,
    })) as unknown as UserWithRelationships[];

    primeUserRelationshipLoaders(users, loaders, include);

    primeProfileLoader(users, loaders.profileByUserId, include.profile || false);

    return users;
  }

  return prisma.user.findMany();
}
