// Explicitly local Auth only. Creates and removes one fake confirmed user; sends no email.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('LOCAL Supabase URL required');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!publicKey) throw new Error('Local publishable key required');
const email=`local-admin-${randomBytes(6).toString('hex')}@example.invalid`,password=randomBytes(32).toString('hex');
const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});
if(error) throw new Error(`Local Auth setup failed: ${error.code||error.status}`);
const jar=new Map();
try {
 const client=createServerClient(url,publicKey,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);
 assert.equal((await client.auth.getUser()).data.user.id,data.user.id);assert.ok(jar.size);
 const restored=createServerClient(url,publicKey,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 assert.equal((await restored.auth.getUser()).data.user.id,data.user.id);
 await restored.auth.signOut();assert.equal((await restored.auth.getUser()).data.user,null);
 console.log('PASS real LOCAL Supabase Auth password login, SSR cookies, verified getUser, cookie restoration and sign-out');
} finally {const result=await service.auth.admin.deleteUser(data.user.id);if(result.error) throw new Error('Local Auth fixture cleanup failed');}
