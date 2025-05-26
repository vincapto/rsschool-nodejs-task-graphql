import { GraphQLResolveInfo } from 'graphql';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { PrismaClient, User } from '@prisma/client';
import {
  Loaders,
  primeUserRelationshipLoaders,
  UserWithRelationships,
} from './dataloaders.js';

export interface IncludeFields {
  userSubscribedTo?: boolean;
  subscribedToUser?: boolean;
  profile?: boolean;
}

export function parseFields(info: GraphQLResolveInfo): IncludeFields {
  const parsed = parseResolveInfo(info);
  const include: IncludeFields = {};

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

export async function getUsersWithRelationships(
  prisma: PrismaClient,
  info: GraphQLResolveInfo,
  loaders: Loaders,
): Promise<User[]> {
  const include = parseFields(info);

  if (Object.keys(include).length > 0) {
    const users = (await prisma.user.findMany({
      include,
    })) as unknown as UserWithRelationships[];

    const userMap = new Map(users.map((u) => [u.id, u]));

    primeUserRelationshipLoaders(users, userMap, loaders, include);

    return users;
  }

  return prisma.user.findMany();
}
