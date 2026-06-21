const operatorHeader = (): Record<string, string> => {
  const name = localStorage.getItem('operatorName')
  return name ? { 'X-Operator': name } : {}
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(path)
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...operatorHeader() },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const response = await fetch(path, { method: 'POST', headers: operatorHeader(), body: form })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...operatorHeader() },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
}
