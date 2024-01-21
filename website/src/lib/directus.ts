import { 
  createDirectus,
  staticToken,
  rest,
  readUser,
  readItems,
  readItem,
} from '@directus/sdk';
import { CourseDef, TopicSource } from 'kodim-cms/esm/content/topic';

export interface User {
  id: string;
  email: string;
  name: string;
  accessRules: string[];
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

const deduceName = (apiUser: Record<string, any>): string => {
  if (apiUser.first_name !== null && apiUser.first_name !== '') {
    return apiUser.first_name;
  }

  if (apiUser.external_identifier !== null && apiUser.external_identifier !== '') {
    return apiUser.external_identifier;
  }

  if (apiUser.email !== null && apiUser.email !== '') {
    return apiUser.email;
  }

  return 'Neznámý uživatel';
}

export const fetchUser = async (id: string): Promise<User> => {
  const apiUser = await client.request(
    readUser(
      id,
      { 
        fields: ['id', 'email', 'first_name', 'groups.*.*', 'external_identifier']
      },
    ),
  );

  const accessRules = apiUser.groups.reduce((acc: string[], group: any) => {
    const ruleObjects = group.Groups_id.accessRules;
    
    if (ruleObjects === null) {
      return acc;
    }

    return [
      ...acc,
      ...ruleObjects.map((ruleObject: any) => ruleObject.rule),
    ];
  }, []);

  const name = deduceName(apiUser);

  return {
    id: apiUser.id,
    email: apiUser.email,
    name,
    accessRules,
  };
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
          'courses.contentFolder',
          'courses.repoUrl',
          'courses.repoFolder',
          'courses.topic.id'
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
    })),
  }));
};

const groupFromApi = (group: Record<string, any>): Group => ({
  id: group.id,
  name: group.Name,
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
