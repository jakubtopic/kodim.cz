import { 
  createDirectus,
  staticToken,
  rest,
  readUser,
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
} from '@directus/sdk';
import { CourseDef, TopicSource } from 'kodim-cms/esm/content/courses-division';

export interface User {
  id: string;
  email: string;
  name: string | null;
  accessRules: string[];
  groups: {
    id: string;
    name: string;
  }[];
  avatarUrl: string | null;
};

type GroupInvite = 'open' | 'closed' | 'none';

export interface Group {
  id: string;
  name: string;
  invite: GroupInvite;
  accessRules: string[];
};

export const client = createDirectus('http://directus:8055')
  .with(staticToken(process.env.DIRECTUS_API_TOKEN ?? ''))
  .with(rest());

export const userFromApi = (apiUser: Record<string, any>): User => {
  const accessRules = apiUser.groups.reduce((acc: string[], group: any) => {
    const ruleObjects = group.Groups_id?.accessRules ?? null;
    if (ruleObjects === null) {
      return acc;
    }

    return [
      ...acc,
      ...ruleObjects.map((ruleObject: any) => ruleObject.rule),
    ];
  }, []);

  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.first_name,
    avatarUrl: apiUser.avatar === null
      ? null
      : `${process.env.DIRECTUS_URL}/assets/${apiUser.avatar}`,
    accessRules,
    groups: apiUser.groups
      .filter((group: any) => group.Groups_id !== null)
      .map((group: any) => ({
        id: group.Groups_id.id,
        name: group.Groups_id.name,
      })),
  };
}

export const fetchUser = async (id: string): Promise<User | null> => {
  try {
    const apiUser = await client.request(
      readUser(
        id,
        { 
          fields: ['id', 'email', 'first_name', 'avatar', 'groups.*.*'],
        }
      ),
    );
    return userFromApi(apiUser);
  } catch (error) {
    console.error('fetchUser error', error);
    return null;
  }
};

export const fetchTopics = async (): Promise<TopicSource[]> => {
  const result = await client.request(
    readItems(
      'Topics',
      {
        fields: [
          'id',
          'title',
          'lead',
          'courses.id',
          'courses.organization',
          'courses.draft',
          'courses.contentFolder',
          'courses.repoUrl',
          'courses.repoFolder',
          'courses.topic.id',
        ],
        sort: 'order',
      },
    ),
  );

  return result.map((topic: Record<string, any>): TopicSource => ({
    name: topic.id,
    title: topic.title,
    lead: topic.lead,
    courses: topic.courses.map((course: Record<string, any>): CourseDef => ({
      name: course.id,
      folder: `/content${course.contentFolder}`,
      topic: course.topic.id,
      organization: course.organization,
      repo: course.repoUrl === null ? null : {
        url: course.repoUrl,
        folder: course.repoFolder === null
          ? `/content${course.contentFolder}`
          : `/content${course.repoFolder}`,
      },
      draft: course.draft,
    })),
  }));
};

const groupFromApi = (group: Record<string, any>): Group => ({
  id: group.id,
  name: group.name,
  invite: group.invite,
  accessRules: group.accessRules?.map((ruleObject: any) => ruleObject.rule) ?? [],
});

export const fetchGroup = async (id: string): Promise<Group | null> => {
  try {
    const result = await client.request(
      readItem('Groups', id, { fields: ['id', 'name', 'invite', 'accessRules.*.*'] }),
    );
    
    return groupFromApi(result);
  } catch {
    return null;
  }
};

export const addToGroup = async (userId: string, groupId: string): Promise<void> => {
  client.request(createItem('Groups_directus_users', {
    Groups_id: groupId,
    directus_users_id: userId,
  }));
}

export const addSubscription = async (email: string, topic: string | null): Promise<void> => {
  let result: Record<string, any> | null = null;
  try {
    result = await client.request(
      readItem('Subscriptions', email),
    );
  } catch {
    result = null;
  }
  
  if (result === null) {
    await client.request(createItem('Subscriptions', {
      email,
      topics: topic,
    }));
    return;
  }

  const newTopics = result.topics === null
    ? topic
    : result.topics + (topic === null ? '' : ` | ${topic}`);

  await client.request(updateItem('Subscriptions', email, {
    topics: newTopics,
  }));
}

export const deleteSubscription = async (email: string): Promise<void> => {
  client.request(deleteItem('Subscriptions', email));
};
