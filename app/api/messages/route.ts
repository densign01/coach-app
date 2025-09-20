import { NextRequest, NextResponse } from 'next/server'

import { getSupabaseRouteClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 100)

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[api/messages] fetch error', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }

  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = getSupabaseRouteClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.message) {
    return NextResponse.json({ error: 'Missing message payload' }, { status: 400 })
  }

  const message = body.message as {
    id: string
    role: 'user' | 'coach' | 'system'
    content: string
    createdAt: string
    metadata?: Record<string, unknown>
  }

  if (!message?.id || !message.content || !message.role) {
    return NextResponse.json({ error: 'Invalid message payload' }, { status: 400 })
  }

  const { error } = await supabase
    .from('chat_messages')
    .upsert({
      id: message.id,
      user_id: user.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? null,
      created_at: message.createdAt ?? new Date().toISOString(),
    })

  if (error) {
    console.error('[api/messages] upsert error', error)
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}
