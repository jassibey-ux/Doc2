import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-welcome-wizard',
  templateUrl: './welcome-wizard.component.html',
  styleUrls: ['./welcome-wizard.component.scss']
})
export class WelcomeWizardComponent implements OnInit {
  visible = false;
  currentSlide = 0;

  slides = [
    {
      icon: 'bx bxs-plus-square',
      title: 'Welcome to DocNock',
      description: 'Secure, streamlined communication built for modern healthcare teams. Let us show you around.',
      buttonText: 'Get Started'
    },
    {
      icon: 'bx bxs-dashboard',
      title: 'Your Dashboard',
      description: 'Your personalized dashboard shows your most important metrics at a glance.',
      buttonText: 'Next'
    },
    {
      icon: 'bx bxs-chat',
      title: 'Chat with Your Team',
      description: 'Send secure messages, share files, and make video calls with your care team.',
      buttonText: 'Next'
    },
    {
      icon: 'bx bxs-check-circle',
      title: "You're All Set!",
      description: 'Visit your profile to complete your setup.',
      buttonText: 'Go to Dashboard'
    }
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    if (!localStorage.getItem('onboarding_complete')) {
      this.visible = true;
    }
  }

  nextSlide() {
    if (this.currentSlide < this.slides.length - 1) {
      this.currentSlide++;
    } else {
      this.completeWizard();
    }
  }

  prevSlide() {
    if (this.currentSlide > 0) {
      this.currentSlide--;
    }
  }

  skipWizard() {
    localStorage.setItem('onboarding_complete', 'true');
    this.visible = false;
  }

  completeWizard() {
    localStorage.setItem('onboarding_complete', 'true');
    this.visible = false;
  }

  goToSlide(index: number) {
    this.currentSlide = index;
  }
}
