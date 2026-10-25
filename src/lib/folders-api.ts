import type { Folder } from '@/types/folder'
import { request } from '@/lib/api-client'

export const foldersApi = {
  async loadFolders(): Promise<Folder[]> { return (await request('/folders')).json() },
  async createFolder(folder: Folder) { await request('/folders', 'POST', folder) },
  async renameFolder(id: string, name: string) { await request(`/folders/${encodeURIComponent(id)}`, 'PATCH', { name }) },
  async deleteFolder(id: string) { await request(`/folders/${encodeURIComponent(id)}`, 'DELETE') },
}
