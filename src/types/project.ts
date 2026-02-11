export interface Project {
  id: string;
  userId: string;
  name: string;
  viewMode: 'page';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateProjectInput {
  name: string;
  viewMode: 'page';
}
