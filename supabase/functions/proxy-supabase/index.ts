import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Troca pro seu domínio em prod
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Ações permitidas pra não virar proxy aberto
type Action = 'list-comments' | 'add-comment' | 'delete-comment'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method!== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json() as { action: Action, payload: any }

    // Cliente admin usando service_role. Essas envs só existem no backend.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let data, error

    switch (action) {
      case 'list-comments':
        // payload: { post_id: number }
        if (!payload?.post_id) throw new Error('post_id obrigatório')
        ;({ data, error } = await supabase
         .from('comments')
         .select('id, texto, created_at')
         .eq('post_id', payload.post_id)
         .order('created_at', { ascending: false })
         .limit(50))
        break

      case 'add-comment':
        // payload: { post_id: number, texto: string }
        if (!payload?.post_id ||!payload?.texto) throw new Error('Dados inválidos')
        if (payload.texto.length > 500) throw new Error('Texto muito longo')

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
        ;({ data, error } = await supabase
         .from('comments')
         .insert({ post_id: payload.post_id, texto: payload.texto.trim(), ip })
         .select()
         .single())
        break

      case 'delete-comment':
        // payload: { id: number }
        // IMPORTANTE: aqui você precisa validar se o usuário pode deletar
        // Como é anônimo, ou você não permite, ou usa um token/hmac
        if (!payload?.id) throw new Error('id obrigatório')
        ;({ data, error } = await supabase
         .from('comments')
         .delete()
         .eq('id', payload.id))
        break

      default:
        throw new Error('Ação inválida')
    }

    if (error) throw error

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: {...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: {...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
