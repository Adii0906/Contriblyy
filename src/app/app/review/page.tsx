"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn, Star, Trash2, TriangleAlert } from "lucide-react";
import { PageHeading } from "@/components/app/results";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/utils";

interface Review {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewPage {
  myReview: Review | null;
}

interface ReviewResponse {
  item: Review;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  }
  return data as T;
}

export default function ReviewPageRoute() {
  const authStatus = useApp((state) => state.auth.status);
  const authUserId = useApp((state) => state.auth.user?.id ?? null);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewOwnerId, setReviewOwnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus !== "signed-in" || !authUserId) {
      return;
    }

    let active = true;
    void requestJson<ReviewPage>("/api/reviews?page=0")
      .then(({ myReview: savedReview }) => {
        if (!active) return;
        setError(null);
        setMyReview(savedReview);
        setRating(savedReview?.rating ?? 0);
        setReviewText(savedReview?.reviewText ?? "");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setMyReview(null);
        setRating(0);
        setReviewText("");
        setError(reason instanceof Error ? reason.message : "Could not load your review.");
      })
      .finally(() => {
        if (active) setReviewOwnerId(authUserId);
      });
    return () => {
      active = false;
    };
  }, [authStatus, authUserId]);

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { item } = await requestJson<ReviewResponse>("/api/reviews", {
        method: myReview ? "PATCH" : "POST",
        body: JSON.stringify({ rating, reviewText }),
      });
      setMyReview(item);
      setRating(item.rating);
      setReviewText(item.reviewText);
      setMessage(myReview ? "Your review has been updated." : "Thanks for sharing your experience!");
      useApp.getState().toast("ok", myReview ? "Your review has been updated." : "Thanks for sharing your experience!");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson<{ deleted: true }>("/api/reviews", { method: "DELETE" });
      setMyReview(null);
      setRating(0);
      setReviewText("");
      setDeleteOpen(false);
      setMessage("Your review has been deleted.");
      useApp.getState().toast("ok", "Your review has been deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete your review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const signedIn = authStatus === "signed-in" && Boolean(authUserId);
  const title = myReview ? "Edit Your Review" : "Write a Review";
  const loadingReview = signedIn && reviewOwnerId !== authUserId;

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <PageHeading eyebrow="Community reviews" title={signedIn ? title : "Share your experience"}>
          Your feedback helps other developers decide whether Contribly is right for them.
        </PageHeading>
      </header>

      {authStatus === "loading" || loadingReview ? (
        <div className="space-y-4" aria-label="Loading your review" aria-busy="true">
          <div className="skeleton h-12 w-full max-w-sm rounded-xl" />
          <div className="skeleton h-36 rounded-[18px]" />
          <div className="skeleton h-11 w-36 rounded-xl" />
        </div>
      ) : authStatus === "unconfigured" ? (
        <div className="rounded-[18px] border border-line bg-paper p-6">
          <h2 className="font-display text-lg font-bold">Reviews aren&apos;t available</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">Community reviews need an account service configured on this server.</p>
        </div>
      ) : !signedIn ? (
        <div className="rounded-[18px] border border-line bg-paper p-6">
          <h2 className="font-display text-lg font-bold">Log in to write a review</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">Your review will be linked to your account, and you can edit or remove it at any time.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/login?next=%2Fapp%2Freview" className={buttonVariants({ variant: "primary" })}>
              <LogIn aria-hidden /> Log in
            </Link>
            <Link href="/signup?next=%2Fapp%2Freview" className={buttonVariants({ variant: "secondary" })}>
              Create account
            </Link>
          </div>
        </div>
      ) : error && !myReview ? (
        <div className="rounded-[18px] border border-bad/20 bg-paper p-6" role="alert">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
            <div>
              <h2 className="font-display text-lg font-bold">Could not load your review</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>Try again</Button>
            </div>
          </div>
        </div>
      ) : (
        <section className="rounded-[18px] border border-line bg-paper p-5 shadow-[var(--shadow-card)] sm:p-7">
          {myReview && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <p className="text-sm font-bold text-ink">Your review is published</p>
                <p className="mt-0.5 text-xs text-muted">You can update or remove it whenever you like.</p>
              </div>
              <Button type="button" variant="danger" size="sm" onClick={() => { setError(null); setDeleteOpen(true); }} disabled={saving}>
                <Trash2 aria-hidden /> Delete review
              </Button>
            </div>
          )}

          {message && <p role="status" className="mb-5 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-semibold text-ok">{message}</p>}
          {error && <p role="alert" className="mb-5 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-semibold text-bad">{error}</p>}

          <form onSubmit={submitReview} className="space-y-6">
            <fieldset>
              <legend className="text-sm font-bold text-ink">Your rating</legend>
              <div className="mt-2 flex gap-1" role="group" aria-label="Choose a rating from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                    aria-pressed={rating === star}
                    onClick={() => setRating(star)}
                    disabled={saving}
                    className="grid size-10 place-items-center rounded-lg transition hover:bg-peach-soft disabled:opacity-60"
                  >
                    <Star className={cn("size-6", star <= rating ? "fill-brand text-brand-ink" : "text-line-strong")} aria-hidden />
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="review-text" className="text-sm font-bold text-ink">Your review</label>
              <textarea
                id="review-text"
                required
                minLength={20}
                maxLength={500}
                rows={5}
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="What has your experience with Contribly been like?"
                disabled={saving}
                aria-describedby="review-text-guidance review-text-count"
                className="mt-2 w-full resize-y rounded-xl border border-line-strong bg-canvas px-3.5 py-3 text-sm leading-relaxed text-ink placeholder:text-muted focus:border-brand-ink disabled:opacity-60"
              />
              <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-muted">
                <p id="review-text-guidance">Share at least 20 characters. Avoid including private information.</p>
                <span id="review-text-count" aria-live="polite">{reviewText.length}/500</span>
              </div>
            </div>

            <Button type="submit" disabled={saving || rating < 1 || reviewText.trim().length < 20}>
              {saving ? "Saving review" : myReview ? "Save changes" : "Submit review"}
            </Button>
          </form>
        </section>
      )}

      <Dialog open={deleteOpen} onClose={() => !saving && setDeleteOpen(false)} title="Delete your review">
        <div className="p-6 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-bad">Delete review</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Remove your review?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Your review will be removed from the community. This action cannot be undone.</p>
          {error && <p role="alert" className="mt-4 rounded-xl border border-bad/20 bg-bad-soft px-4 py-3 text-sm font-semibold text-bad">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setDeleteOpen(false)} disabled={saving}>Keep review</Button>
            <Button type="button" variant="danger" size="md" onClick={() => void deleteReview()} disabled={saving}>
              {saving ? "Deleting" : "Delete review"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
