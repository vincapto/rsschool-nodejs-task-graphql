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
import { UUIDType } from './types/uuid.js';
import type { PrismaClient, User, Profile } from '@prisma/client';
import type { GraphQLResolveInfo } from 'graphql';
import { createLoaders, Loaders } from './dataloaders.js';
import { getUsersWithRelationships } from './field-parser.js';

const MemberTypeIdEnum = new GraphQLEnumType({
  name: 'MemberTypeId',
  values: {
    BASIC: { value: 'BASIC' },
    BUSINESS: { value: 'BUSINESS' },
  },
});

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
      resolve: async (profile: Profile, _args, { loaders }: GqlContext) =>
        loaders.memberTypeById.load(profile.memberTypeId),
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
      resolve: async (user: User, _args, { loaders }: GqlContext) =>
        loaders.profileByUserId.load(user.id),
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

const schema = new GraphQLSchema({
  query: RootQueryType,
  mutation: MutationsType,
  types: [UserType, ProfileType, PostType, MemberTypeType],
});

interface GqlContext {
  prisma: PrismaClient;
  loaders: Loaders;
  getUsersWithSubs: (info: GraphQLResolveInfo) => Promise<User[]>;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
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
      const loaders = createLoaders(fastify.prisma);
      const { query, variables } = req.body;
      const getUsersWithSubs = async (info: GraphQLResolveInfo): Promise<User[]> => {
        return getUsersWithRelationships(fastify.prisma, info, loaders);
      };
      const context: GqlContext = { prisma: fastify.prisma, loaders, getUsersWithSubs };
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
