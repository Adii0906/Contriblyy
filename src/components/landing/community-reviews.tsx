"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Flag, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Review {
  id: string;
  rating: number;
  reviewText: string;
  displayName: string;
  githubUsername: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReviewPage {
  items: Review[];
  hasMore: boolean;
  page: number;
  reviewCount: number;
  averageRating: number | null;
  isAuthenticated: boolean;
  myReview: Review | null;
  myReviewError: string | null;
}

const PAGE_SIZE = 6;

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  return data;
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`size-4 ${star <= rating ? "fill-brand text-brand-ink" : "text-line-strong"}`} aria-hidden />
      ))}
    </span>
  );
}

function Avatar({ review }: { review: Review }) {
  return review.avatarUrl ? (
    <Image
      src={review.avatarUrl}
      alt=""
      width={44}
      height={44}
      unoptimized
      className="size-11 rounded-full border border-line object-cover"
    />
  ) : (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-peach-soft font-display text-lg font-bold text-brand-ink">
      {review.displayName.trim().charAt(0).toUpperCase() || "C"}
    </span>
  );
}

function ReviewCard({
  review,
  isMine,
  isAuthenticated,
  onEdit,
  onDelete,
  onReport,
}: {
  review: Review;
  isMine: boolean;
  isAuthenticated: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const date = new Date(review.createdAt);
  const formattedDate = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <article className="group flex h-full flex-col rounded-[20px] border border-line bg-paper p-5 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-lift)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar review={review} />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold text-ink">{review.displayName}</p>
            {review.githubUsername ? (
              <a
                href={`https://github.com/${review.githubUsername}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[13px] font-medium text-muted hover:text-brand-ink hover:underline"
              >
                @{review.githubUsername}
              </a>
            ) : (
              <span className="text-[13px] text-muted">Contribly community</span>
            )}
          </div>
        </div>
        {isMine ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onEdit} aria-label="Edit your review" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-peach-soft hover:text-ink">
              <Pencil className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete your review" className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-bad-soft hover:text-bad">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ) : isAuthenticated ? (
          <button type="button" onClick={onReport} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-peach-soft hover:text-ink">
            <Flag className="size-3.5" aria-hidden />
            Report
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <Stars rating={review.rating} label={`${review.rating} out of 5 stars`} />
      </div>
      <p className="mt-3 flex-1 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink-2">{review.reviewText}</p>
      <time dateTime={review.createdAt} className="mt-5 border-t border-line pt-3 text-xs font-medium text-muted">
        {formattedDate}
      </time>
    </article>
  );
}

export function CommunityReviews() {
  const router = useRouter();
  const [items, setItems] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myReviewError, setMyReviewError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [saving, setSaving] = useState(false);

  const applyPage = useCallback((data: Record<string, unknown>, append: boolean) => {
    const result = data as unknown as ReviewPage;
    setItems((previous) => append ? [...previous, ...result.items] : result.items);
    setMyReview(result.myReview);
    setMyReviewError(result.myReviewError);
    setIsAuthenticated(result.isAuthenticated);
    setReviewCount(result.reviewCount);
    setAverageRating(result.averageRating);
    setHasMore(result.hasMore);
    setNextPage(result.page + 1);
  }, []);

  const loadPage = useCallback(async (page: number, append: boolean) => {
    const data = await requestJson(`/api/reviews?page=${page}`);
    applyPage(data, append);
  }, [applyPage]);

  useEffect(() => {
    let active = true;
    void requestJson("/api/reviews?page=0")
      .then((data) => {
        if (active) applyPage(data, false);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load community reviews.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyPage]);

  const openEditor = () => {
    setMessage(null);
    setError(null);
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/#community-reviews")}`);
      return;
    }
    if (myReviewError) {
      setError(myReviewError);
      return;
    }
    setRating(myReview?.rating ?? 0);
    setReviewText(myReview?.reviewText ?? "");
    setEditorOpen(true);
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await requestJson("/api/reviews", {
        method: myReview ? "PATCH" : "POST",
        body: JSON.stringify({ rating, reviewText }),
      });
      const saved = data.item as Review;
      setMyReview(saved);
      setItems((previous) => [saved, ...previous.filter((review) => review.id !== saved.id)].slice(0, PAGE_SIZE));
      if (!myReview) {
        setReviewCount((count) => count + 1);
        setAverageRating((average) => average === null ? saved.rating : Number(((average * reviewCount + saved.rating) / (reviewCount + 1)).toFixed(1)));
      }
      setMessage(myReview ? "Your review has been updated." : "Thanks for sharing your experience!");
      setEditorOpen(false);
      try {
        await loadPage(0, false);
      } catch {
        setError("Your review was saved, but the latest summary could not be refreshed.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async () => {
    setSaving(true);
    setError(null);
    try {
      await requestJson("/api/reviews", { method: "DELETE" });
      setItems((previous) => previous.filter((review) => review.id !== myReview?.id));
      setMyReview(null);
      setReviewCount((count) => Math.max(0, count - 1));
      setMessage("Your review has been deleted.");
      setDeleteOpen(false);
      try {
        await loadPage(0, false);
      } catch {
        setError("Your review was deleted, but the latest summary could not be refreshed.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete your review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const reportReview = async (review: Review) => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/#community-reviews")}`);
      return;
    }
    if (!window.confirm("Report this review as inappropriate?")) return;
    setError(null);
    setMessage(null);
    try {
      await requestJson("/api/reviews/report", { method: "POST", body: JSON.stringify({ reviewId: review.id }) });
      setMessage("Thanks. Your report has been sent for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your report. Please try again.");
    }
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextPage, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more reviews.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section id="community-reviews" className="scroll-mt-8 border-y border-line bg-peach-soft">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-brand-ink">
              Community reviews
            </p>
            <h2 className="font-display text-[clamp(2rem,4.2vw,3.2rem)] font-bold leading-[1.04] tracking-[-0.04em] text-balance">
              Built for developers. Backed by the community.
            </h2>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Real feedback from developers using Contribly to find meaningful open-source contributions.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {myReview && !items.some((review) => review.id === myReview.id) && (
              <Button type="button" variant="secondary" size="md" onClick={() => { setError(null); setDeleteOpen(true); }}>
                Delete your review
              </Button>
            )}
            <Button type="button" variant="primary" size="md" onClick={openEditor} disabled={Boolean(myReviewError)}>
              {myReview ? "Edit your review" : "Write a review"}
            </Button>
          </div>
        </div>

        {!loading && reviewCount > 0 && (
          <div className="mt-7 inline-flex items-center gap-2.5 rounded-xl border border-line bg-paper px-4 py-2.5 text-sm shadow-[var(--shadow-card)]">
            <Stars rating={Math.round(averageRating ?? 0)} label={`Average rating ${averageRating?.toFixed(1)} out of 5`} />
            <span className="font-display font-bold text-ink">{averageRating?.toFixed(1)}</span>
            <span className="h-4 w-px bg-line-strong" aria-hidden />
            <span className="text-muted">{reviewCount} {reviewCount === 1 ? "review" : "reviews"}</span>
          </div>
        )}

        {message && <p role="status" className="mt-5 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-semibold text-ok">{message}</p>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-semibold text-bad">{error}</p>}
        {myReviewError && <p role="alert" className="mt-5 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-semibold text-bad">{myReviewError}</p>}

        {loading ? (
          <div className="mt-9 grid min-h-[220px] gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading community reviews" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-[20px] border border-line bg-paper p-6">
                <div className="flex items-center gap-3">
                  <span className="skeleton size-11 rounded-full" />
                  <span className="space-y-2"><span className="skeleton block h-3 w-28" /><span className="skeleton block h-3 w-20" /></span>
                </div>
                <span className="skeleton mt-5 block h-4 w-28" />
                <span className="skeleton mt-4 block h-3 w-full" />
                <span className="skeleton mt-2 block h-3 w-4/5" />
                <span className="skeleton mt-2 block h-3 w-3/5" />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <>
            <div className="mt-9 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isMine={review.id === myReview?.id}
                  isAuthenticated={isAuthenticated}
                  onEdit={openEditor}
                  onDelete={() => { setError(null); setDeleteOpen(true); }}
                  onReport={() => void reportReview(review)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button type="button" variant="secondary" size="md" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {loadingMore ? "Loading reviews" : "Load more reviews"}
                </Button>
              </div>
            )}
          </>
        ) : !error ? (
          <div className="mt-9 rounded-[22px] border border-dashed border-line-strong bg-paper/75 px-6 py-10 text-center sm:px-10">
            <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl bg-peach-soft text-brand-ink">
              <Star className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-xl font-bold tracking-tight text-ink">Be the first to share your experience.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">If Contribly has helped you find a meaningful contribution, tell other developers what worked for you.</p>
          </div>
        ) : null}
      </div>

      <Dialog open={editorOpen} onClose={() => !saving && setEditorOpen(false)} title={myReview ? "Edit your community review" : "Write a community review"}>
        <form onSubmit={submitReview} className="p-6 sm:p-7" aria-busy={saving}>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-ink">{myReview ? "Your community review" : "Your experience matters"}</p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{myReview ? "Edit your review" : "Write a review"}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">Share your honest experience using Contribly. Your review will be public.</p>
          <fieldset className="mt-6">
            <legend className="text-sm font-bold text-ink">Your rating</legend>
            <div className="mt-2 flex gap-1" role="group" aria-label="Choose a rating from 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                  aria-pressed={rating === star}
                  onClick={() => setRating(star)}
                  className="grid size-10 place-items-center rounded-lg transition hover:bg-peach-soft"
                >
                  <Star className={`size-6 ${star <= rating ? "fill-brand text-brand-ink" : "text-line-strong"}`} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="community-review-text" className="mt-5 block text-sm font-bold text-ink">Your review</label>
          <textarea
            id="community-review-text"
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            minLength={20}
            maxLength={500}
            required
            rows={5}
            aria-describedby="community-review-count"
            placeholder="What has your experience been like?"
            className="mt-2 block w-full resize-y rounded-xl border border-line-strong bg-white px-3.5 py-3 text-sm leading-relaxed text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>20–500 characters</span>
            <span id="community-review-count" aria-live="polite">{reviewText.length}/500</span>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-bad">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="md" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" size="md" disabled={saving || rating < 1 || reviewText.trim().length < 20}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {saving ? "Saving review" : myReview ? "Save changes" : "Submit review"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => !saving && setDeleteOpen(false)} title="Delete your review">
        <div className="p-6 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-bad">Delete review</p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Are you sure?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">Your review will be removed from the community. This action cannot be undone.</p>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-bad">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="md" onClick={() => setDeleteOpen(false)} disabled={saving}>Keep review</Button>
            <Button type="button" variant="primary" size="md" onClick={() => void deleteReview()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {saving ? "Deleting" : "Delete review"}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
