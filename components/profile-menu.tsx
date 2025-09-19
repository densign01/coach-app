'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionContext } from '@supabase/auth-helpers-react'
import { Menu } from 'lucide-react'

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

  const displayName = useMemo(() => {
    if (username && username.trim().length > 0) return username
    const email = session?.user?.email ?? ''
    return email ? email.split('@')[0] : 'Account'
  }, [session?.user?.email, username])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <Menu className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Signed in as</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm font-medium text-foreground">{displayName}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            router.push('/profile')
          }}
        >
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async (event) => {
            event.preventDefault()
            await supabaseClient.auth.signOut()
            router.replace('/login')
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
