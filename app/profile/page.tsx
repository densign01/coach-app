"use client"

import { useRouter } from "next/navigation"
import { useSessionContext } from "@supabase/auth-helpers-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function ProfilePage() {
  const router = useRouter()
  const { session, isLoading } = useSessionContext()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading your profile...</p>
      </div>
    )
  }

  if (!session) {
    router.replace("/login")
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold">Your Profile</h1>
            <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-6">
        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Account Information</h2>

            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <p className="text-sm text-muted-foreground mt-1">
                  {session.user?.email || 'Not available'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">User ID</label>
                <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                  {session.user?.id || 'Not available'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Account Created</label>
                <p className="text-sm text-muted-foreground mt-1">
                  {session.user?.created_at
                    ? new Date(session.user.created_at).toLocaleDateString()
                    : 'Not available'
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <p className="text-sm text-muted-foreground">
              This is a simplified profile page. Full profile editing features will be available soon.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}