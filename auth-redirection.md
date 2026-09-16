 ### 1. Why Google authentication was succeeding but the redirect was failing                                                      
                                                                                                                                    
  1. Disconnected Auth State: authService.ts:137 was successfully completing Google OAuth and setting the Supabase session in       
  supabase.auth. However, AuthProvider.tsx:30 was completely unaware of Supabase auth: it only initialized from a local             
  loadSession() cache and did not listen to Supabase auth state changes or sync the new Supabase session.                           
  2. Layout Gatekeeper Bounce: Because AuthProvider.tsx:30 remained in session: null, when welcome.tsx called router.               
  replace("/(customer)/(tabs)"), the customer layout (_layout.tsx:7) ran const { session } = useAuth(). Finding !session, it        
  immediately kicked the user back via <Redirect href="/(auth)/login" /> (which also targeted the deleted login route).             
  3. Bypassed Role Architecture: Hardcoding router.replace("/(customer)/(tabs)") in welcome.tsx bypassed the role-determination     
  logic required for admin vs customer users and created competing redirect logic with index.tsx.                                   
  ──────                                                                                                                            
  ### 2. Which files were changed                                                                                                   
                                                                                                                                    
  1. authService.ts:                                                                                                                
      • Added authService.ts:12 to inspect the Supabase user, query the profiles table, detect role (customer vs admin), and        
      construct the app's auth.ts:3 and user.ts:3 structures.                                                                       
      • Added authService.ts:112 for profile lookups.                                                                               
      • Attached both methods to authService.ts:136.                                                                                
  2. AuthProvider.tsx:                                                                                                              
      • Connected initial session hydration to supabase.auth.getSession() and registered a supabase.auth.onAuthStateChange listener.
      • Added AuthProvider.tsx:38 to synchronously hydrate and persist the session in state and storage.                            
      • Hooked AuthProvider.tsx:161 to call authService.ts:264 and clear local session storage.                                     
  3. welcome.tsx:                                                                                                                   
      • After signInWithGoogle() completes, calls await syncSession(res.session) to guarantee AuthProvider.tsx:30 holds the         
      authenticated state.                                                                                                          
      • Replaced the hardcoded route with router.replace("/"), delegating destination selection to index.tsx.                       
      • Added an effect to automatically redirect to "/" if an active session is already detected.                                  
  4. _layout.tsx:10 & _layout.tsx:8:                                                                                                
      • Updated the unauthenticated redirect fallback from deleted "/(auth)/login" to "/(auth)/welcome".                            
  5. _layout.tsx & reset-password.tsx:                                                                                              
      • Removed screens and redirects pointing to the deleted manual login and register screens.                                    
  6. supabase.ts:23:                                                                                                                
      • Exported getSupabase helper to eliminate dangling imports and satisfy TypeScript checking across the project.               
                                                                                                                                    
  ──────                                                                                                                            
  ### 3. What the actual customer home route is                                                                                     
                                                                                                                                    
  The customer home route configured by Expo Router is:                                                                             
                                                                                                                                    
    /(customer)/(tabs)                                                                                                              
                                                                                                                                    
  This renders the main customer storefront inside index.tsx (index.tsx:29).                                                        
  ──────                                                                                                                            
  ### 4. How the redirect now works                                                                                                 
                                                                                                                                    
    welcome.tsx (Login with Google tapped)                                                                                          
         ↓                                                                                                                          
    authService.signInWithGoogle() (OAuth session created in Supabase)                                                              
         ↓                                                                                                                          
    await syncSession(res.session) (Role & profile resolved, saved to storage, set in AuthProvider)                                 
         ↓
    router.replace("/")
         ↓
    src/app/index.tsx (Root Router)
         ├── session.role === "admin"    →  Redirect href="/(admin)"
         └── session.role === "customer" →  Redirect href="/(customer)/(tabs)"
  
  1. In welcome.tsx, Google authentication completes and returns the Supabase session.
  2. syncSession(res.session) resolves the user's role and profile, persists the session to SecureStore/storage, and sets React     
  state.
  3. welcome.tsx performs router.replace("/").
  4. index.tsx evaluates session.role:
      • Customers redirect to /(customer)/(tabs)
      • Admins redirect to /(admin)
  5. Layout guards in _layout.tsx and _layout.tsx confirm the session is present and render their respective screens.
  ──────
  ### 5. Whether the root index.tsx remains responsible for session-based routing
  
  Yes. index.tsx remains the single source of truth for all session- and role-based routing:
  
  • Startup without session: Redirects to /(auth)/welcome
  • Startup with customer session: Redirects to /(customer)/(tabs)
  • Startup with admin session: Redirects to /(admin)
  • Post-login redirect: welcome.tsx passes control back to "/", preventing competing redirect logic and keeping role routing       
  centralized.