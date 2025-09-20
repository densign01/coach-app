"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ComponentType } from "react"
import { useRouter } from "next/navigation"
import { useSessionContext } from "@supabase/auth-helpers-react"
import { Apple, Dumbbell, Loader2, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ProfileMenu } from "@/components/profile-menu"

import { useCoachChat } from "@/hooks/use-coach-chat"
import { useMealDrafts } from "@/hooks/use-meal-drafts"
import { useCoachStore } from "@/lib/state/coach-store"
import { calculateDailyTotals, getMealsByType, getMealsForDate, getWorkoutsForDate, getWeeklyWorkoutStats } from "@/lib/data/queries"
import type { MealDraft, Tab } from "@/lib/types"

export default function CoachApp() {
  const router = useRouter()
  const { session, isLoading: isSessionLoading } = useSessionContext()
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [inputValue, setInputValue] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, isProcessing, error } = useCoachChat()
  const { state } = useCoachStore()
  const { drafts, confirmDraft, dismissDraft } = useMealDrafts()

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/login")
    }
  }, [isSessionLoading, session, router])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, drafts])

  const todaysMeals = useMemo(
    () => getMealsForDate(state.meals, state.activeDate),
    [state.meals, state.activeDate],
  )

  const mealsByType = useMemo(() => getMealsByType(todaysMeals), [todaysMeals])
  const mealTotals = useMemo(() => calculateDailyTotals(todaysMeals), [todaysMeals])

  const todaysWorkouts = useMemo(
    () => getWorkoutsForDate(state.workouts, state.activeDate),
    [state.workouts, state.activeDate],
  )

  const weeklyWorkoutStats = useMemo(() => getWeeklyWorkoutStats(state), [state])

  const recentWorkouts = useMemo(
    () => [...state.workouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [state.workouts],
  )

  const completedWeekdays = useMemo(() => {
    const set = new Set<number>()
    state.workouts.forEach((workout) => {
      const weekday = new Date(workout.date).getDay()
      set.add(weekday)
    })
    return set
  }, [state.workouts])

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return
    await sendMessage(inputValue)
    setInputValue("")
  }

  if (isSessionLoading || !session) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading your coach...</div>
  }

  const renderHomeTab = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-balance">Your Coach</h1>
            <p className="text-muted-foreground mt-1">Share how you are feeling, eating, or moving.</p>
          </div>
          <ProfileMenu username={state.profile?.username ?? state.profile?.firstName} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-6">
          <div className="space-y-4 pb-28">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] p-4 rounded-lg ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
                  <p className="text-xs opacity-70 mt-2">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {drafts.length > 0 ? (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <MealDraftCard
                    key={draft.id}
                    draft={draft}
                    onConfirm={() => void confirmDraft(draft)}
                    onDismiss={() => dismissDraft(draft.id)}
                  />
                ))}
              </div>
            ) : null}

            {/* Invisible element to scroll to */}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-border">
        <div className="flex gap-2 items-center">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Tell me about a meal, workout, or how you're feeling..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSendMessage()
              }
            }}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} className="px-6" disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
          </Button>
        </div>
      </div>
    </div>
  )

  const renderNutritionTab = () => (
    <div className="h-full overflow-y-auto p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-balance">Nutrition</h1>
        <p className="text-muted-foreground mt-1">Directional targets for today</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Today&apos;s Totals</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <MacroStat label="Calories" value={`${mealTotals.calories.toFixed(0)}`} suffix="cal" />
          <MacroStat label="Protein" value={`${mealTotals.protein.toFixed(0)}`} suffix="g" />
          <MacroStat label="Fat" value={`${mealTotals.fat.toFixed(0)}`} suffix="g" />
          <MacroStat label="Carbs" value={`${mealTotals.carbs.toFixed(0)}`} suffix="g" />
        </div>
        <Separator className="my-4" />
        <p className="text-sm text-muted-foreground">
          Target: {state.targets.calories} cal, {state.targets.protein}g protein, {state.targets.fat}g fat, {state.targets.carbs}g carbs
        </p>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Meals logged</h2>
        {todaysMeals.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Nothing logged yet. Tell Coach what you ate and we&apos;ll draft it for confirmation.
          </Card>
        ) : (
          Object.entries(mealsByType)
            .filter(([, meals]) => meals.length > 0)
            .map(([type, meals]) => (
              <div key={type} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{type}</h3>
                {meals.map((meal) => (
                  <Card key={meal.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{meal.items.join(", ")}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Logged {new Date(meal.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{meal.macros.calories.toFixed(0)} cal</p>
                        <p>P {meal.macros.protein.toFixed(0)}g · F {meal.macros.fat.toFixed(0)}g · C {meal.macros.carbs.toFixed(0)}g</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  )

  const renderFitnessTab = () => (
    <div className="h-full overflow-y-auto p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-balance">Fitness</h1>
        <p className="text-muted-foreground mt-1">Adaptive plan that counts every activity</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">This Week&apos;s Progress</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <MacroStat label="Workouts" value={`${weeklyWorkoutStats.workoutsCompleted}`} />
          <MacroStat label="Minutes" value={`${weeklyWorkoutStats.totalMinutes}`} />
          <MacroStat label="Adherence" value={`${weeklyWorkoutStats.adherence}`} suffix="%" />
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Today&apos;s Activities</h2>
        {todaysWorkouts.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Nothing logged yet. Tell Coach what you did (even a walk) and we&apos;ll track it.
          </Card>
        ) : (
          todaysWorkouts.map((workout) => (
            <Card key={workout.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold">{workout.type}</p>
                  {workout.description ? (
                    <p className="text-xs text-muted-foreground mt-1">{workout.description}</p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{workout.minutes} min</p>
                  {workout.distance ? <p>{workout.distance} miles</p> : null}
                  <p className="capitalize">{workout.status}</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Weekly Template</h2>
        <div className="grid gap-2">
          {state.weeklyPlan.map((entry) => {
            const fulfilled = completedWeekdays.has(entry.weekday)
            return (
              <Card key={entry.id} className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold">{entry.focus}</p>
                    <p className="text-xs text-muted-foreground mt-1">Suggested intensity: {entry.suggestedIntensity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{entry.minutesTarget} min</p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        fulfilled ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {fulfilled ? "Completed" : "Upcoming"}
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Recent Activity</h2>
        {recentWorkouts.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Once you log a workout, it will appear here for quick context.
          </Card>
        ) : (
          recentWorkouts.map((workout) => (
            <Card key={`${workout.id}-history`} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold">{workout.type}</p>
                  <p className="text-xs text-muted-foreground mt-1">{workout.description ?? 'Logged via chat'}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{workout.minutes} min • {workout.intensity ?? 'moderate'}</p>
                  {workout.distance ? <p>{workout.distance} miles</p> : null}
                  <p>{new Date(workout.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        {activeTab === "home" && renderHomeTab()}
        {activeTab === "nutrition" && renderNutritionTab()}
        {activeTab === "fitness" && renderFitnessTab()}
      </div>

      <div className="border-t border-border bg-card">
        <div className="flex">
          <NavButton icon={MessageCircle} label="Home" isActive={activeTab === "home"} onClick={() => setActiveTab("home")}
          />
          <NavButton icon={Apple} label="Nutrition" isActive={activeTab === "nutrition"} onClick={() => setActiveTab("nutrition")}
          />
          <NavButton icon={Dumbbell} label="Fitness" isActive={activeTab === "fitness"} onClick={() => setActiveTab("fitness")}
          />
        </div>
      </div>
    </div>
  )
}

interface MacroStatProps {
  label: string
  value: string
  suffix?: string
}

function MacroStat({ label, value, suffix }: MacroStatProps) {
  return (
    <div>
      <p className="text-2xl font-semibold">
        {value}
        {suffix ? <span className="text-base text-muted-foreground ml-1">{suffix}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

interface NavButtonProps {
  icon: ComponentType<{ className?: string }>
  label: string
  isActive: boolean
  onClick: () => void
}

function NavButton({ icon: Icon, label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center py-3 px-4 transition-colors ${
        isActive ? "text-primary bg-accent/10" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-5 h-5 mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

interface MealDraftCardProps {
  draft: MealDraft
  onConfirm: () => void
  onDismiss: () => void
}

function MealDraftCard({ draft, onConfirm, onDismiss }: MealDraftCardProps) {
  const macros = draft.payload.macros
  const confidence = draft.payload.confidence ?? "medium"

  const formatMacro = (value?: number) => (typeof value === "number" ? value.toFixed(0) : "0")

  return (
    <Card className="p-4 border-dashed border-muted-foreground/40">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-semibold">Confirm this meal?</p>
          <p className="text-sm text-muted-foreground mt-1">
            {draft.payload.items?.join(", ") ?? draft.payload.originalText}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Confidence: {confidence.toUpperCase()}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      {macros ? (
        <div className="grid grid-cols-4 gap-4 text-center text-xs text-muted-foreground mt-4">
          <div>
            <p className="font-semibold">{formatMacro(macros.calories)}</p>
            <p>cal</p>
          </div>
          <div>
            <p className="font-semibold">{formatMacro(macros.protein)}</p>
            <p>protein</p>
          </div>
          <div>
            <p className="font-semibold">{formatMacro(macros.fat)}</p>
            <p>fat</p>
          </div>
          <div>
            <p className="font-semibold">{formatMacro(macros.carbs)}</p>
            <p>carbs</p>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onDismiss}>
          Edit later
        </Button>
        <Button onClick={onConfirm}>Looks good</Button>
      </div>
    </Card>
  )
}
