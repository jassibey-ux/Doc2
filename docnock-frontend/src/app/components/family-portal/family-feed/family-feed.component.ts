import { Component, Input, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';

@Component({
  selector: 'app-family-feed',
  templateUrl: './family-feed.component.html',
  styleUrls: ['./family-feed.component.scss'],
})
export class FamilyFeedComponent implements OnInit {
  @Input() conversationId: string = '';

  posts: any[] = [];
  loading: boolean = true;
  loadingMore: boolean = false;
  page: number = 1;
  hasMore: boolean = false;
  totalPosts: number = 0;
  activeSlideIndices: { [postId: string]: number } = {};

  constructor(private authService: AuthServiceService) {}

  ngOnInit(): void {
    this.loadFeed();
  }

  loadFeed() {
    this.loading = true;
    this.page = 1;
    this.authService.getFamilyFeed(this.page).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.posts = res.data.posts || [];
          this.hasMore = res.data.pagination?.hasMore || false;
          this.totalPosts = res.data.pagination?.total || 0;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadMore() {
    if (this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    this.page++;

    this.authService.getFamilyFeed(this.page).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.posts = [...this.posts, ...(res.data.posts || [])];
          this.hasMore = res.data.pagination?.hasMore || false;
        }
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
        this.page--;
      },
    });
  }

  refresh() {
    this.loadFeed();
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      update: 'Update',
      photo: 'Photo',
      event: 'Event',
      announcement: 'Announcement',
    };
    return labels[type] || 'Update';
  }

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() || 'S';
  }

  trackByPostId(index: number, post: any): string {
    return post._id;
  }

  getActiveSlide(postId: string): number {
    return this.activeSlideIndices[postId] || 0;
  }

  onCarouselScroll(event: Event, postId: string): void {
    const el = event.target as HTMLElement;
    const slideWidth = el.clientWidth;
    if (slideWidth > 0) {
      this.activeSlideIndices[postId] = Math.round(el.scrollLeft / slideWidth);
    }
  }

  goToSlide(postId: string, index: number, event: Event): void {
    event.stopPropagation();
    const dotEl = event.target as HTMLElement;
    const carousel = dotEl.closest('.image-carousel')?.querySelector('.carousel-track') as HTMLElement;
    if (carousel) {
      carousel.scrollTo({ left: index * carousel.clientWidth, behavior: 'smooth' });
    }
    this.activeSlideIndices[postId] = index;
  }
}
