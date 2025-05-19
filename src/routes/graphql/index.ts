import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import { graphql } from 'graphql';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLInputObjectType,
} from 'graphql';
import depthLimit from 'graphql-depth-limit';
import DataLoader from 'dataloader';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { UUIDType } from './types/uuid.js';
import type { PrismaClient, User, Post, Profile, MemberType } from '@prisma/client';
import type { GraphQLResolveInfo } from 'graphql';

// --- ENUMS ---
const MemberTypeIdEnum = new GraphQLEnumType({
  name: 'MemberTypeId',
  values: {
    BASIC: { value: 'BASIC' },
    BUSINESS: { value: 'BUSINESS' },
  },
});

// --- INPUT TYPES ---
const CreateUserInput = new GraphQLInputObjectType({
  name: 'CreateUserInput',
  fields: {
    name: { type: new GraphQLNonNull(GraphQLString) },
    balance: { type: new GraphQLNonNull(GraphQLFloat) },
  },
});

const ChangeUserInput = new GraphQLInputObjectType({
  name: 'ChangeUserInput',
  fields: {
    name: { type: GraphQLString },
    balance: { type: GraphQLFloat },
  },
});

const CreateProfileInput = new GraphQLInputObjectType({
  name: 'CreateProfileInput',
  fields: {
    isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
    yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
    userId: { type: new GraphQLNonNull(UUIDType) },
    memberTypeId: { type: new GraphQLNonNull(MemberTypeIdEnum) },
  },
});

const ChangeProfileInput = new GraphQLInputObjectType({
  name: 'ChangeProfileInput',
  fields: {
    isMale: { type: GraphQLBoolean },
    yearOfBirth: { type: GraphQLInt },
    memberTypeId: { type: MemberTypeIdEnum },
  },
});

const CreatePostInput = new GraphQLInputObjectType({
  name: 'CreatePostInput',
  fields: {
    title: { type: new GraphQLNonNull(GraphQLString) },
    content: { type: new GraphQLNonNull(GraphQLString) },
    authorId: { type: new GraphQLNonNull(UUIDType) },
  },
});

const ChangePostInput = new GraphQLInputObjectType({
  name: 'ChangePostInput',
  fields: {
    title: { type: GraphQLString },
    content: { type: GraphQLString },
  },
});

// --- OBJECT TYPES ---
const MemberTypeType = new GraphQLObjectType({
  name: 'MemberType',
  fields: () => ({
    id: { type: new GraphQLNonNull(MemberTypeIdEnum) },
    discount: { type: new GraphQLNonNull(GraphQLFloat) },
    postsLimitPerMonth: { type: new GraphQLNonNull(GraphQLInt) },
  }),
});

const PostType = new GraphQLObjectType({
  name: 'Post',
  fields: () => ({
    id: { type: new GraphQLNonNull(UUIDType) },
    title: { type: new GraphQLNonNull(GraphQLString) },
    content: { type: new GraphQLNonNull(GraphQLString) },
  }),
});

const ProfileType = new GraphQLObjectType({
  name: 'Profile',
  fields: () => ({
    id: { type: new GraphQLNonNull(UUIDType) },
    isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
    yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
    memberType: {
      type: new GraphQLNonNull(MemberTypeType),
      resolve: async (profile: Profile, _args, { prisma }: GqlContext) =>
        prisma.memberType.findUnique({ where: { id: profile.memberTypeId } }),
    },
  }),
});

const UserType: import('graphql').GraphQLObjectType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: new GraphQLNonNull(UUIDType) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    balance: { type: new GraphQLNonNull(GraphQLFloat) },
    profile: {
      type: ProfileType,
      resolve: async (user: User, _args, { prisma }: GqlContext) =>
        prisma.profile.findUnique({ where: { userId: user.id } }),
    },
    posts: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PostType))),
      resolve: async (user: User, _args, { loaders }: GqlContext) => loaders.postsByAuthorId.load(user.id),
    },
    userSubscribedTo: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
      resolve: async (user: User, _args, { loaders }: GqlContext) => loaders.userSubscribedTo.load(user.id),
    },
    subscribedToUser: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
      resolve: async (user: User, _args, { loaders }: GqlContext) => loaders.subscribedToUser.load(user.id),
    },
  }),
});

// --- ROOT QUERY TYPE ---
const RootQueryType = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: () => ({
    memberTypes: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(MemberTypeType))),
      resolve: (_root, _args, { prisma }: GqlContext) => prisma.memberType.findMany(),
    },
    memberType: {
      type: MemberTypeType,
      args: { id: { type: new GraphQLNonNull(MemberTypeIdEnum) } },
      resolve: (_root, { id }: { id: string }, { prisma }: GqlContext) => prisma.memberType.findUnique({ where: { id } }),
    },
    users: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
      resolve: async (_root, _args, context: GqlContext, info: GraphQLResolveInfo) => {
        return context.getUsersWithSubs(info);
      },
    },
    user: {
      type: UserType,
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: async (_root, { id }: { id: string }, { prisma }: GqlContext): Promise<User | null> => {
        return prisma.user.findUnique({ where: { id } });
      },
    },
    posts: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PostType))),
      resolve: (_root, _args, { prisma }: GqlContext) => prisma.post.findMany(),
    },
    post: {
      type: PostType,
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: (_root, { id }: { id: string }, { prisma }: GqlContext) => prisma.post.findUnique({ where: { id } }),
    },
    profiles: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ProfileType))),
      resolve: (_root, _args, { prisma }: GqlContext) => prisma.profile.findMany(),
    },
    profile: {
      type: ProfileType,
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: (_root, { id }: { id: string }, { prisma }: GqlContext) => prisma.profile.findUnique({ where: { id } }),
    },
  }),
});

// --- ROOT MUTATION TYPE ---
const MutationsType = new GraphQLObjectType({
  name: 'Mutations',
  fields: () => ({
    createUser: {
      type: new GraphQLNonNull(UserType),
      args: { dto: { type: new GraphQLNonNull(CreateUserInput) } },
      resolve: async (_root, { dto }: { dto: { name: string; balance: number } }, { prisma }: GqlContext) => prisma.user.create({ data: dto }),
    },
    createProfile: {
      type: new GraphQLNonNull(ProfileType),
      args: { dto: { type: new GraphQLNonNull(CreateProfileInput) } },
      resolve: async (_root, { dto }: { dto: { isMale: boolean; yearOfBirth: number; userId: string; memberTypeId: string } }, { prisma }: GqlContext) => prisma.profile.create({ data: dto }),
    },
    createPost: {
      type: new GraphQLNonNull(PostType),
      args: { dto: { type: new GraphQLNonNull(CreatePostInput) } },
      resolve: async (_root, { dto }: { dto: { title: string; content: string; authorId: string } }, { prisma }: GqlContext) => prisma.post.create({ data: dto }),
    },
    changeUser: {
      type: new GraphQLNonNull(UserType),
      args: {
        id: { type: new GraphQLNonNull(UUIDType) },
        dto: { type: new GraphQLNonNull(ChangeUserInput) },
      },
      resolve: async (_root, { id, dto }: { id: string; dto: { name?: string; balance?: number } }, { prisma }: GqlContext) => prisma.user.update({ where: { id }, data: dto }),
    },
    changeProfile: {
      type: new GraphQLNonNull(ProfileType),
      args: {
        id: { type: new GraphQLNonNull(UUIDType) },
        dto: { type: new GraphQLNonNull(ChangeProfileInput) },
      },
      resolve: async (_root, { id, dto }: { id: string; dto: { isMale?: boolean; yearOfBirth?: number; memberTypeId?: string } }, { prisma }: GqlContext) => prisma.profile.update({ where: { id }, data: dto }),
    },
    changePost: {
      type: new GraphQLNonNull(PostType),
      args: {
        id: { type: new GraphQLNonNull(UUIDType) },
        dto: { type: new GraphQLNonNull(ChangePostInput) },
      },
      resolve: async (_root, { id, dto }: { id: string; dto: { title?: string; content?: string } }, { prisma }: GqlContext) => prisma.post.update({ where: { id }, data: dto }),
    },
    deleteUser: {
      type: new GraphQLNonNull(GraphQLString),
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: async (_root, { id }: { id: string }, { prisma }: GqlContext) => {
        await prisma.user.delete({ where: { id } });
        return id;
      },
    },
    deleteProfile: {
      type: new GraphQLNonNull(GraphQLString),
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: async (_root, { id }: { id: string }, { prisma }: GqlContext) => {
        await prisma.profile.delete({ where: { id } });
        return id;
      },
    },
    deletePost: {
      type: new GraphQLNonNull(GraphQLString),
      args: { id: { type: new GraphQLNonNull(UUIDType) } },
      resolve: async (_root, { id }: { id: string }, { prisma }: GqlContext) => {
        await prisma.post.delete({ where: { id } });
        return id;
      },
    },
    subscribeTo: {
      type: new GraphQLNonNull(GraphQLString),
      args: {
        userId: { type: new GraphQLNonNull(UUIDType) },
        authorId: { type: new GraphQLNonNull(UUIDType) },
      },
      resolve: async (_root, { userId, authorId }: { userId: string; authorId: string }, { prisma }: GqlContext) => {
        await prisma.subscribersOnAuthors.create({ data: { subscriberId: userId, authorId } });
        return userId;
      },
    },
    unsubscribeFrom: {
      type: new GraphQLNonNull(GraphQLString),
      args: {
        userId: { type: new GraphQLNonNull(UUIDType) },
        authorId: { type: new GraphQLNonNull(UUIDType) },
      },
      resolve: async (_root, { userId, authorId }: { userId: string; authorId: string }, { prisma }: GqlContext) => {
        await prisma.subscribersOnAuthors.delete({ where: { subscriberId_authorId: { subscriberId: userId, authorId } } });
        return userId;
      },
    },
  }),
});

// --- SCHEMA ---
const schema = new GraphQLSchema({
  query: RootQueryType,
  mutation: MutationsType,
  types: [UserType, ProfileType, PostType, MemberTypeType],
});

// --- DATALOADERS ---
type Loaders = {
  postsByAuthorId: DataLoader<string, Post[]>;
  userSubscribedTo: DataLoader<string, User[]>;
  subscribedToUser: DataLoader<string, User[]>;
};

interface GqlContext {
  prisma: PrismaClient;
  loaders: Loaders;
  getUsersWithSubs: (info: GraphQLResolveInfo) => Promise<User[]>;
}

function createLoaders(prisma: PrismaClient): Loaders {
  return {
    postsByAuthorId: new DataLoader<string, Post[]>(async (userIds) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: userIds as string[] } },
      });
      return userIds.map((id) => posts.filter((p) => p.authorId === id));
    }),
    userSubscribedTo: new DataLoader<string, User[]>(async (userIds) => {
      // For each userId, find all users they are subscribed to
      const subs = await prisma.subscribersOnAuthors.findMany({
        where: { subscriberId: { in: userIds as string[] } },
      });
      const authorIds = Array.from(new Set(subs.map((s) => s.authorId)));
      const authors = await prisma.user.findMany({ where: { id: { in: authorIds } } });
      const authorMap = new Map(authors.map((u) => [u.id, u]));
      return userIds.map((userId) =>
        subs.filter((s) => s.subscriberId === userId).map((s) => authorMap.get(s.authorId)!).filter(Boolean)
      );
    }),
    subscribedToUser: new DataLoader<string, User[]>(async (userIds) => {
      // For each userId, find all users who are subscribed to them
      const subs = await prisma.subscribersOnAuthors.findMany({
        where: { authorId: { in: userIds as string[] } },
      });
      const subscriberIds = Array.from(new Set(subs.map((s) => s.subscriberId)));
      const subscribers = await prisma.user.findMany({ where: { id: { in: subscriberIds } } });
      const subscriberMap = new Map(subscribers.map((u) => [u.id, u]));
      return userIds.map((userId) =>
        subs.filter((s) => s.authorId === userId).map((s) => subscriberMap.get(s.subscriberId)!).filter(Boolean)
      );
    }),
  };
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // TODO: Define GraphQL types, schema, DataLoaders, and resolvers here

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      const { query, variables } = req.body;
      const loaders = createLoaders(fastify.prisma);
      // Helper for users query: join subs only if requested
      const getUsersWithSubs = async (info: GraphQLResolveInfo): Promise<User[]> => {
        const parsed = parseResolveInfo(info);
        const include: Record<string, boolean> = {};
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
        }
        if (Object.keys(include).length) {
          const users = await fastify.prisma.user.findMany({ include });
          // Prime DataLoader caches
          if (include.userSubscribedTo) {
            const allSubs = await fastify.prisma.subscribersOnAuthors.findMany({
              where: { subscriberId: { in: users.map((u) => u.id) } },
            });
            const authorIds = Array.from(new Set(allSubs.map((s) => s.authorId)));
            const authors = await fastify.prisma.user.findMany({ where: { id: { in: authorIds } } });
            const authorMap = new Map(authors.map((u) => [u.id, u]));
            users.forEach((u) => {
              const subs = allSubs.filter((s) => s.subscriberId === u.id).map((s) => authorMap.get(s.authorId)!).filter(Boolean);
              loaders.userSubscribedTo.clear(u.id).prime(u.id, subs);
            });
          }
          if (include.subscribedToUser) {
            const allSubs = await fastify.prisma.subscribersOnAuthors.findMany({
              where: { authorId: { in: users.map((u) => u.id) } },
            });
            const subscriberIds = Array.from(new Set(allSubs.map((s) => s.subscriberId)));
            const subscribers = await fastify.prisma.user.findMany({ where: { id: { in: subscriberIds } } });
            const subscriberMap = new Map(subscribers.map((u) => [u.id, u]));
            users.forEach((u) => {
              const subs = allSubs.filter((s) => s.authorId === u.id).map((s) => subscriberMap.get(s.subscriberId)!).filter(Boolean);
              loaders.subscribedToUser.clear(u.id).prime(u.id, subs);
            });
          }
          return users;
        }
        return fastify.prisma.user.findMany();
      };
      const context: GqlContext = { prisma: fastify.prisma, loaders, getUsersWithSubs };
      // Use custom validation for depth limit
      const { validate, specifiedRules } = await import('graphql');
      const { parse } = await import('graphql');
      const ast = parse(query);
      const errors = validate(schema, ast, [...specifiedRules, depthLimit(5)]);
      if (errors.length) {
        return { errors };
      }
      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        contextValue: context,
      });
      return result;
    },
  });
};

export default plugin;
