"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSessionContext } from "@supabase/auth-helpers-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const router = useRouter()
  const { supabaseClient, session, isLoading } = useSessionContext()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && session) {
      router.replace("/")
    }
  }, [isLoading, session, router])

  const handleSignIn = async () => {
    setError(null)
    setMessage(null)

    if (!email.trim()) {
      setError("Enter your email to receive a magic link.")
      return
    }

    setIsSubmitting(true)
    const { error: signInError } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}`,
      },
    })

    if (signInError) {
      setError(signInError.message)
    } else {
      setMessage("Check your inbox for a magic link to continue.")
      setEmail("")
    }

    setIsSubmitting(false)
  }

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut()
  }

  if (isLoading || session) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        {session ? "Redirecting to your coach..." : "Preparing your workspace..."}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Sign in to Coach</h1>
          <p className="text-sm text-muted-foreground">No passwords required—use a magic link to get started.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <Button className="w-full" onClick={handleSignIn} disabled={isSubmitting}>
            {isSubmitting ? "Sending magic link..." : "Send magic link"}
          </Button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>

        <div className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Signed in elsewhere? You can <button className="underline" onClick={handleSignOut}>sign out</button> here.
        </div>
      </Card>
    </div>
  )
}
