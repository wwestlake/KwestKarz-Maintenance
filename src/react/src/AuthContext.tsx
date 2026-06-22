import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './firebase'

export type UserProfile = {
  id: string
  firebaseUid: string
  phone: string
  displayName?: string
  role: string
  status: string
  createdAt: string
  notifyByEmail: boolean
  emailAddress: string | null
}

type AuthState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'pending'; firebaseUser: User; profile: UserProfile }
  | { kind: 'suspended'; firebaseUser: User; profile: UserProfile }
  | { kind: 'active'; firebaseUser: User; profile: UserProfile }

type AuthContextValue = {
  state: AuthState
  firebaseUser: User | null
  profile: UserProfile | null
  getToken: () => Promise<string | null>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function registerProfile(token: string): Promise<UserProfile> {
  const response = await fetch('/api/users/me', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)

  const resolveState = async (user: User) => {
    try {
      const token = await user.getIdToken()
      const profile = await registerProfile(token)
      if (profile.status === 'active') {
        setState({ kind: 'active', firebaseUser: user, profile })
      } else if (profile.status === 'suspended') {
        setState({ kind: 'suspended', firebaseUser: user, profile })
      } else {
        setState({ kind: 'pending', firebaseUser: user, profile })
      }
    } catch {
      setState({ kind: 'unauthenticated' })
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (!user) {
        setState({ kind: 'unauthenticated' })
      } else {
        await resolveState(user)
      }
    })
    return unsubscribe
  }, [])

  const getToken = async (): Promise<string | null> => {
    if (!firebaseUser) return null
    return firebaseUser.getIdToken()
  }

  const refreshProfile = async () => {
    if (firebaseUser) await resolveState(firebaseUser)
  }

  const signOut = async () => {
    await auth.signOut()
    setState({ kind: 'unauthenticated' })
    setFirebaseUser(null)
  }

  const profile =
    state.kind === 'active' || state.kind === 'pending' || state.kind === 'suspended'
      ? state.profile
      : null

  return (
    <AuthContext.Provider value={{ state, firebaseUser, profile, getToken, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
