import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthServiceService } from 'src/app/services/auth-service.service';
import { CoreService } from 'src/app/shared/core.service';

@Component({
  selector: 'app-sso-settings',
  templateUrl: './sso-settings.component.html',
  styleUrls: ['./sso-settings.component.scss'],
})
export class SsoSettingsComponent implements OnInit {
  loading = true;
  saving = false;
  testing = false;
  testResult: any = null;

  // Active provider tab
  activeProvider: 'saml' | 'oauth' | 'ldap' = 'saml';

  // SAML Config
  samlConfig: any = {
    enabled: false,
    entityId: '',
    ssoUrl: '',
    sloUrl: '',
    certificate: '',
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    signRequests: true,
    encryptAssertions: false,
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    },
    autoProvision: true,
    defaultRole: 'nurse',
    allowedDomains: '',
  };

  // OAuth Config
  oauthConfig: any = {
    enabled: false,
    provider: 'custom',
    clientId: '',
    clientSecret: '',
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    scopes: 'openid profile email',
    callbackUrl: '',
    attributeMapping: {
      email: 'email',
      firstName: 'given_name',
      lastName: 'family_name',
      role: 'role',
    },
  };

  // LDAP Config
  ldapConfig: any = {
    enabled: false,
    serverUrl: '',
    bindDn: '',
    bindPassword: '',
    searchBase: '',
    searchFilter: '(sAMAccountName={{username}})',
    useTls: true,
    tlsCertificate: '',
    attributeMapping: {
      email: 'mail',
      firstName: 'givenName',
      lastName: 'sn',
      role: 'memberOf',
    },
    groupMapping: [
      { adGroup: 'CN=Doctors,OU=Staff,DC=hospital,DC=local', role: 'doctor' },
      { adGroup: 'CN=Nurses,OU=Staff,DC=hospital,DC=local', role: 'nurse' },
      { adGroup: 'CN=Admins,OU=Staff,DC=hospital,DC=local', role: 'admin' },
    ],
  };

  // Provider presets
  oauthPresets: any[] = [
    { value: 'custom', label: 'Custom Provider' },
    { value: 'azure', label: 'Microsoft Azure AD' },
    { value: 'okta', label: 'Okta' },
    { value: 'google', label: 'Google Workspace' },
    { value: 'onelogin', label: 'OneLogin' },
  ];

  nameIdFormats: any[] = [
    { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', label: 'Email Address' },
    { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', label: 'Persistent' },
    { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient', label: 'Transient' },
    { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified', label: 'Unspecified' },
  ];

  roles: string[] = ['admin', 'doctor', 'nurse', 'staff', 'read-only'];

  constructor(
    private authService: AuthServiceService,
    private toastr: ToastrService,
    private coreService: CoreService
  ) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    // In production, load from API
    setTimeout(() => {
      this.loading = false;
      this.samlConfig.callbackUrl = window.location.origin + '/api/v1/auth/saml/callback';
      this.oauthConfig.callbackUrl = window.location.origin + '/api/v1/auth/oauth/callback';
    }, 500);
  }

  setActiveProvider(provider: 'saml' | 'oauth' | 'ldap'): void {
    this.activeProvider = provider;
    this.testResult = null;
  }

  applyOAuthPreset(): void {
    const presets: any = {
      azure: {
        authorizationUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
        scopes: 'openid profile email User.Read',
      },
      okta: {
        authorizationUrl: 'https://{domain}.okta.com/oauth2/default/v1/authorize',
        tokenUrl: 'https://{domain}.okta.com/oauth2/default/v1/token',
        userInfoUrl: 'https://{domain}.okta.com/oauth2/default/v1/userinfo',
        scopes: 'openid profile email',
      },
      google: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
        scopes: 'openid profile email',
      },
    };
    const preset = presets[this.oauthConfig.provider];
    if (preset) {
      Object.assign(this.oauthConfig, preset);
    }
  }

  saveConfig(): void {
    this.saving = true;
    // In production, call API
    setTimeout(() => {
      this.saving = false;
      this.toastr.success('SSO configuration saved successfully');
    }, 1000);
  }

  testConnection(): void {
    this.testing = true;
    this.testResult = null;
    // In production, call API test endpoint
    setTimeout(() => {
      this.testing = false;
      this.testResult = {
        success: Math.random() > 0.3,
        message: Math.random() > 0.3 ? 'Connection successful. Provider responded with valid metadata.' : 'Connection failed: Unable to reach SSO provider endpoint.',
        timestamp: new Date().toISOString(),
      };
      if (this.testResult.success) {
        this.toastr.success('Connection test passed');
      } else {
        this.toastr.error(this.testResult.message);
      }
    }, 2000);
  }

  addGroupMapping(): void {
    this.ldapConfig.groupMapping.push({ adGroup: '', role: 'nurse' });
  }

  removeGroupMapping(index: number): void {
    this.ldapConfig.groupMapping.splice(index, 1);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.toastr.info('Copied to clipboard');
    });
  }
}
