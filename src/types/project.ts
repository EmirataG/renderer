export interface Project {
  id: string;
  name: string;
  viewMode: 'page';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  scoreUrl?: string;
  scoreFileName?: string;
  audioUrl?: string;
  audioFileName?: string;
  backgroundUrl?: string;
  backgroundFileName?: string;
}
