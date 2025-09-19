"use client"

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useSessionContext } from "@supabase/auth-helpers-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCoachStore } from "@/lib/state/coach-store"
import { upsertUserProfile } from "@/lib/api/client"

const genderOptions = [
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Non-binary", value: "non-binary" },
  { label: "Prefer not to say", value: "prefer-not" },
]

export default function ProfilePage() {
  const router = useRouter()
  const { session, isLoading } = useSessionContext()
  const {
    state: { profile },
    dispatch,
  } = useCoachStore()

  const [formState, setFormState] = useState({
    username: "",
    firstName: "",
    lastName: "",
    heightCm: "",
    weightKg: "",
    age: "",
    gender: "",
    goals: "",
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login")
    }
  }, [isLoading, session, router])

  useEffect(() => {
    if (!profile) return
    setFormState({
      username: profile.username ?? "",
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      heightCm: profile.heightCm ? String(profile.heightCm) : "",
      weightKg: profile.weightKg ? String(profile.weightKg) : "",
      age: profile.age ? String(profile.age) : "",
      gender: profile.gender ?? "",
      goals: profile.goals ?? "",
    })
  }, [profile])

  const userEmail = session?.user?.email ?? ""
  const usernameFallback = useMemo(() => userEmail.split("@")[0] ?? "", [userEmail])

  const handleChange = (field: keyof typeof formState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleGenderChange = (value: string) => {
    setFormState((prev) => ({ ...prev, gender: value }))
  }

  const handleSubmit = async () => {
    setIsSaving(true)
    setError(null)
    setMessage(null)

    const payload = {
      userId: session?.user?.id ?? "",
      ...formState,
      username: formState.username.trim() || usernameFallback,
      heightCm: formState.heightCm ? Number(formState.heightCm) : null,
      weightKg: formState.weightKg ? Number(formState.weightKg) : null,
      age: formState.age ? Number(formState.age) : null,
    }

    const result = await upsertUserProfile(payload)

    if (!result) {
      setError("We couldn't save your profile. Please try again.")
      setIsSaving(false)
      return
    }

    dispatch({ type: "setProfile", profile: result })
    setMessage("Profile updated.")
    setIsSaving(false)
  }

  if (isLoading || !session) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading your profile...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold">Your Profile</h1>
            <p className="text-sm text-muted-foreground">Tune your goals and basics so Coach can personalize the plan.</p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
        <Card className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Username" supporting="Shown in Coach. Defaults to your email prefix." required>
              <Input value={formState.username || usernameFallback} onChange={handleChange("username")} placeholder="coachfan" />
            </Field>
            <Field label="Email" supporting="From your account" readOnly>
              <Input value={userEmail} readOnly />
            </Field>
            <Field label="First name">
              <Input value={formState.firstName} onChange={handleChange("firstName")} placeholder="Jordan" />
            </Field>
            <Field label="Last name">
              <Input value={formState.lastName} onChange={handleChange("lastName")} placeholder="Lee" />
            </Field>
            <Field label="Height (cm)">
              <Input value={formState.heightCm} onChange={handleChange("heightCm")} placeholder="170" inputMode="decimal" />
            </Field>
            <Field label="Weight (kg)">
              <Input value={formState.weightKg} onChange={handleChange("weightKg")} placeholder="68" inputMode="decimal" />
            </Field>
            <Field label="Age">
              <Input value={formState.age} onChange={handleChange("age")} placeholder="32" inputMode="numeric" />
            </Field>
            <Field label="Gender">
              <Select value={formState.gender} onValueChange={handleGenderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not specified</SelectItem>
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Goals" supporting="Summarize what you're working toward.">
            <Textarea value={formState.goals} onChange={handleChange("goals")} placeholder="Build strength while staying energized for trail runs." rows={4} />
          </Field>

          <div className="flex items-center justify-between gap-4">
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={handleSubmit} disabled={isSaving} className="ml-auto">
              {isSaving ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
  supporting?: string
  required?: boolean
  readOnly?: boolean
}

function Field({ label, supporting, children, required, readOnly }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
        {readOnly ? <span className="text-xs uppercase text-muted-foreground">Read only</span> : null}
      </div>
      {children}
      {supporting ? <p className="text-xs text-muted-foreground">{supporting}</p> : null}
    </div>
  )
}
