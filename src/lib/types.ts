export type GoalStatus = "unread" | "reading" | "completed";

export interface Book {
  id: number;
  isbn: string;
  title: string;
  author?: string | null;
  publisher?: string | null;
  published_year?: string | null;
  ndc?: string | null;
  description?: string | null;
}

export interface GoalBook {
  id: number;
  shelf: string;
  recommendation_order: number;
  status: GoalStatus;
  completion_date?: string | null;
  reason?: string | null;
  book: Book;
}

export interface Goal {
  id: number;
  title: string;
  description?: string | null;
  deadline?: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  goal_books: GoalBook[];
}

export interface AvailabilitySnapshot {
  library_system: string;
  library_name: string;
  status: "available" | "checked_out" | "reservable" | "unknown";
  estimated_wait_days?: number | null;
  opac_url?: string | null;
}

export interface RecommendationItem {
  book: Book;
  goal_book_id: number;
  shelf: string;
  order: number;
  reason?: string | null;
  availability: AvailabilitySnapshot[];
}

export interface RecommendationResponse {
  goal_id: number;
  recommendations: RecommendationItem[];
  generated_at: string;
  expires_at: string;
}
