import { auth } from './firebase'

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {}
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    headers['Authorization'] = `Bearer ${token}`
  }
  // X-Operator is set server-side from user profile when auth is active;
  // kept for local dev (auth disabled) fallback
  const name = localStorage.getItem('operatorName')
  if (name) headers['X-Operator'] = name
  return headers
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(path, { headers: authHeaders })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(path, { method: 'POST', headers: authHeaders, body: form })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
}
