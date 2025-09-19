'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionContext } from '@supabase/auth-helpers-react'
import { User, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface ProfileMenuProps {
  username?: string | null
}

export function ProfileMenu({ username }: ProfileMenuProps) {
  const router = useRouter()
  const { supabaseClient, session } = useSessionContext()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const displayName = useMemo(() => {
    if (username && username.trim().length > 0) return username
    const email = session?.user?.email ?? ''
    return email ? email.split('@')[0] : 'Account'
  }, [session?.user?.email, username])

  const handleProfileClick = () => {
    try {
      console.log('Profile clicked - navigating to /profile')
      router.push('/profile')
    } catch (error) {
      console.error('Profile navigation error:', error)
    }
  }

  const handleSignOut = async () => {
    if (isSigningOut) return

    try {
      console.log('Starting sign out process')
      setIsSigningOut(true)
      await supabaseClient.auth.signOut()
      console.log('Sign out successful, redirecting to login')
      router.replace('/login')
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {displayName}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleProfileClick}
        className="flex items-center gap-2"
      >
        <User className="h-4 w-4" />
        Profile
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </span>
      </Button>
    </div>
  )
}
