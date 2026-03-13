import { createSchema, createYoga, createPubSub } from 'graphql-yoga';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

// In-memory data
const authors = [
  { id: '1', name: 'Ursula K. Le Guin', bio: 'American author of speculative fiction.' },
  { id: '2', name: 'Frank Herbert', bio: 'American science fiction author.' },
  { id: '3', name: 'Isaac Asimov', bio: 'American author and professor of biochemistry.' },
];

const books = [
  { id: '1', title: 'The Left Hand of Darkness', year: 1969, authorId: '1' },
  { id: '2', title: 'The Dispossessed', year: 1974, authorId: '1' },
  { id: '3', title: 'Dune', year: 1965, authorId: '2' },
  { id: '4', title: 'Children of Dune', year: 1976, authorId: '2' },
  { id: '5', title: 'Foundation', year: 1951, authorId: '3' },
  { id: '6', title: 'I, Robot', year: 1950, authorId: '3' },
];

let nextBookId = books.length + 1;

const pubsub = createPubSub();

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Author {
      id: ID!
      name: String!
      bio: String!
      books: [Book!]!
    }

    type Book {
      id: ID!
      title: String!
      year: Int!
      author: Author!
    }

    type Query {
      books: [Book!]!
      book(id: ID!): Book
      authors: [Author!]!
      author(id: ID!): Author
    }

    type Mutation {
      addBook(title: String!, year: Int!, authorId: ID!): Book!
      deleteBook(id: ID!): Boolean!
    }

    type Subscription {
      bookAdded: Book!
    }
  `,
  resolvers: {
    Query: {
      books: () => books,
      book: (_, { id }) => books.find((b) => b.id === id) ?? null,
      authors: () => authors,
      author: (_, { id }) => authors.find((a) => a.id === id) ?? null,
    },
    Mutation: {
      addBook: (_, { title, year, authorId }) => {
        const author = authors.find((a) => a.id === authorId);
        if (!author) throw new Error(`Author with id ${authorId} not found`);
        const book = { id: String(nextBookId++), title, year, authorId };
        books.push(book);
        pubsub.publish('bookAdded', book);
        return book;
      },
      deleteBook: (_, { id }) => {
        const index = books.findIndex((b) => b.id === id);
        if (index === -1) return false;
        books.splice(index, 1);
        return true;
      },
    },
    Subscription: {
      bookAdded: {
        subscribe: () => pubsub.subscribe('bookAdded'),
        resolve: (book) => book,
      },
    },
    Book: {
      author: (book) => authors.find((a) => a.id === book.authorId),
    },
    Author: {
      books: (author) => books.filter((b) => b.authorId === author.id),
    },
  },
});

const yoga = createYoga({ schema });

const server = createServer(yoga);

const wsServer = new WebSocketServer({ server, path: yoga.graphqlEndpoint });

useServer(
  {
    execute: (args) => args.rootValue.execute(args),
    subscribe: (args) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, message) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
        ...ctx,
        req: ctx.extra.request,
        socket: ctx.extra.socket,
        params: message.payload,
      });

      const args = {
        schema,
        operationName: message.payload.operationName,
        document: parse(message.payload.query),
        variableValues: message.payload.variables,
        contextValue: await contextFactory(),
        rootValue: { execute, subscribe },
      };

      const errors = validate(args.schema, args.document);
      if (errors.length) return errors;
      return args;
    },
  },
  wsServer,
);

server.listen(4000, () => {
  console.log('GraphQL server running at http://localhost:4000/graphql');
});
