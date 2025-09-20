export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string | null
          auth_provider: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email?: string | null
          auth_provider?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          auth_provider?: string | null
          created_at?: string
        }
      }
      profiles: {
        Row: {
          user_id: string
          username: string | null
          first_name: string | null
          last_name: string | null
          height_cm: number | null
          weight_kg: number | null
          age: number | null
          gender: string | null
          goals: string | null
          profile_summary: string | null
          insights_json: Json | null
          onboarding_step: number | null
          onboarding_data: Json | null
          onboarding_completed: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          age?: number | null
          gender?: string | null
          goals?: string | null
          profile_summary?: string | null
          insights_json?: Json | null
          onboarding_step?: number | null
          onboarding_data?: Json | null
          onboarding_completed?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          age?: number | null
          gender?: string | null
          goals?: string | null
          profile_summary?: string | null
          insights_json?: Json | null
          onboarding_step?: number | null
          onboarding_data?: Json | null
          onboarding_completed?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      days: {
        Row: {
          id: string
          user_id: string
          date: string
          targets_json: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          targets_json?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          targets_json?: Json | null
          created_at?: string
        }
      }
      meals: {
        Row: {
          id: string
          day_id: string
          type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          items_json: Json
          macros_json: Json | null
          source: 'est' | 'api' | 'vision'
          created_at: string
        }
        Insert: {
          id?: string
          day_id: string
          type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          items_json: Json
          macros_json?: Json | null
          source?: 'est' | 'api' | 'vision'
          created_at?: string
        }
        Update: {
          id?: string
          day_id?: string
          type?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          items_json?: Json
          macros_json?: Json | null
          source?: 'est' | 'api' | 'vision'
          created_at?: string
        }
      }
      meal_drafts: {
        Row: {
          id: string
          user_id: string
          temp_id: string
          parsed_json: Json
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          user_id: string
          temp_id: string
          parsed_json: Json
          created_at?: string
          expires_at: string
        }
        Update: {
          id?: string
          user_id?: string
          temp_id?: string
          parsed_json?: Json
          created_at?: string
          expires_at?: string
        }
      }
      workouts: {
        Row: {
          id: string
          day_id: string
          type: string
          minutes: number | null
          distance: number | null
          raw_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          day_id: string
          type: string
          minutes?: number | null
          distance?: number | null
          raw_text?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          day_id?: string
          type?: string
          minutes?: number | null
          distance?: number | null
          raw_text?: string | null
          created_at?: string
        }
      }
      summaries: {
        Row: {
          id: string
          day_id: string
          daily_totals_json: Json | null
          coach_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          day_id: string
          daily_totals_json?: Json | null
          coach_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          day_id?: string
          daily_totals_json?: Json | null
          coach_notes?: string | null
          created_at?: string
        }
      }
      integrations: {
        Row: {
          id: string
          user_id: string
          provider: string
          scopes: string[] | null
          status: 'pending' | 'active' | 'revoked'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          scopes?: string[] | null
          status?: 'pending' | 'active' | 'revoked'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          scopes?: string[] | null
          status?: 'pending' | 'active' | 'revoked'
          created_at?: string
        }
      }
      health_samples: {
        Row: {
          id: string
          user_id: string
          type: string
          value: number
          unit: string
          timestamp: string
          source: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          value: number
          unit: string
          timestamp: string
          source?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          value?: number
          unit?: string
          timestamp?: string
          source?: string | null
        }
      }
    }
    Functions: {
      get_today_plan: {
        Args: { user_id: string; date: string }
        Returns: Json
      }
      get_day_totals: {
        Args: { user_id: string; date: string }
        Returns: Json
      }
      get_recent_meals: {
        Args: { user_id: string; n: number }
        Returns: Json
      }
      get_last_workout: {
        Args: { user_id: string }
        Returns: Json
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
