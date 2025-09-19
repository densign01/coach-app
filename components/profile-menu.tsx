'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionContext } from '@supabase/auth-helpers-react'
import { Menu, User, LogOut } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    console.log('Profile clicked - navigating to /profile')
    router.push('/profile')
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <Menu className="h-4 w-4" />
          <span className="sr-only">Open profile menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" sideOffset={8}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Signed in as</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm font-medium text-foreground truncate">{displayName}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleProfileClick} className="cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
          disabled={isSigningOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
