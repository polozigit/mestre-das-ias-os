/// <reference lib="deno.ns" />
import {createHandler,createRestDependencies} from './handler.mjs';

const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const url=Deno.env.get('SUPABASE_URL');
if(!url||!serviceKey)throw new Error('Ambiente Supabase não configurado.');
Deno.serve(createHandler(createRestDependencies({url,serviceKey})));
