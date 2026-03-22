import { Component, OnInit } from '@angular/core';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-family-feed-creator',
  templateUrl: './family-feed-creator.component.html',
  styleUrls: ['./family-feed-creator.component.scss'],
})
export class FamilyFeedCreatorComponent implements OnInit {
  // Post form
  postType: string = 'update';
  postTitle: string = '';
  postBody: string = '';
  postVisibility: string = 'all_families';
  postImages: any[] = [];
  uploading: boolean = false;
  submitting: boolean = false;

  // Recent posts list
  recentPosts: any[] = [];
  loadingPosts: boolean = true;

  // Image preview
  imagePreviewUrls: string[] = [];

  postTypes = [
    { value: 'update', label: 'Update', icon: 'bx-edit' },
    { value: 'photo', label: 'Photo', icon: 'bx-camera' },
    { value: 'event', label: 'Event', icon: 'bx-calendar-event' },
    { value: 'announcement', label: 'Announcement', icon: 'bx-megaphone' },
  ];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadRecentPosts();
  }

  loadRecentPosts() {
    this.loadingPosts = true;
    this.authService.getFamilyFeed(1, 10).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.recentPosts = res.data.posts || [];
        }
        this.loadingPosts = false;
      },
      error: () => {
        this.loadingPosts = false;
      },
    });
  }

  onImageSelected(event: any) {
    const files = event.target?.files;
    if (!files?.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      // Preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreviewUrls.push(e.target.result);
      };
      reader.readAsDataURL(file);

      // Upload
      this.uploadImage(file);
    }
  }

  uploadImage(file: File) {
    this.uploading = true;
    const formData = new FormData();
    formData.append('image', file);

    const token = this.authService.getToken();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${environment.apiUrl}/upload-image`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onload = () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        if (res.imageUrls?.length) {
          this.postImages.push({ url: res.imageUrls[0], caption: '' });
        }
      }
      this.uploading = false;
    };

    xhr.onerror = () => {
      this.toastr.error('Image upload failed');
      this.uploading = false;
    };

    xhr.send(formData);
  }

  removeImage(index: number) {
    this.postImages.splice(index, 1);
    this.imagePreviewUrls.splice(index, 1);
  }

  submitPost() {
    if (!this.postBody.trim()) {
      this.toastr.warning('Post body is required');
      return;
    }

    if (this.postType === 'event' && !this.postTitle.trim()) {
      this.toastr.warning('Title is required for events');
      return;
    }

    this.submitting = true;

    this.authService.createFeedPost({
      type: this.postType,
      title: this.postTitle,
      body: this.postBody,
      images: this.postImages,
      visibility: this.postVisibility,
    }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Post published');
          this.resetForm();
          this.loadRecentPosts();
        } else {
          this.toastr.error(res.message || 'Failed to create post');
        }
        this.submitting = false;
      },
      error: () => {
        this.toastr.error('Failed to create post');
        this.submitting = false;
      },
    });
  }

  deletePost(postId: string) {
    this.authService.deleteFeedPost(postId).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toastr.success('Post deleted');
          this.recentPosts = this.recentPosts.filter((p) => p._id !== postId);
        }
      },
      error: () => {
        this.toastr.error('Failed to delete post');
      },
    });
  }

  // AI Family Update Generator
  generatingUpdate: boolean = false;
  showAiInput: boolean = false;
  conversationIdForAI: string = '';

  generateWithAI() {
    if (!this.conversationIdForAI.trim()) {
      this.toastr.warning('Please enter a conversation ID');
      return;
    }

    this.generatingUpdate = true;

    this.authService.generateFamilyUpdate(this.conversationIdForAI).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.postBody = res.update;
          this.postType = 'update';
          this.showAiInput = false;
          this.toastr.success('Update generated! Review and edit before publishing.');
        } else {
          this.toastr.error(res.message || 'Failed to generate update');
        }
        this.generatingUpdate = false;
      },
      error: () => {
        this.toastr.error('Failed to generate AI update');
        this.generatingUpdate = false;
      },
    });
  }

  resetForm() {
    this.postType = 'update';
    this.postTitle = '';
    this.postBody = '';
    this.postVisibility = 'all_families';
    this.postImages = [];
    this.imagePreviewUrls = [];
  }

  getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
