import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method!== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const { action, payload } = await req.json()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let data

    switch (action) {
      case 'get-post-data': {
        const { data: post } = await supabase.from('posts').select('id, title').eq('slug', payload.slug).single()
        if (!post) throw new Error('Post não encontrado')

        const [{ count }, { data: userLike }, { data: comments }] = await Promise.all([
          supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          supabase.from('likes').select('id').eq('post_id', post.id).eq('visitor_id', payload.visitor_id).maybeSingle(),
          supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: false }).limit(50)
        ])

        data = { post, like_count: count, user_has_liked:!!userLike, comments }
        break
      }

      case 'list-comments': {
        const { data: comments } = await supabase.from('comments').select('*').eq('post_id', payload.post_id).order('created_at', { ascending: false }).limit(50)
        data = comments
        break
      }

      case 'like-post': {
        await supabase.from('likes').insert({ post_id: payload.post_id, visitor_id: payload.visitor_id })
        data = { success: true }
        break
      }

      case 'unlike-post': {
        await supabase.from('likes').delete().eq('post_id', payload.post_id).eq('visitor_id', payload.visitor_id)
        data = { success: true }
        break
      }

      case 'add-comment': {
        if (!payload.author_name ||!payload.content) throw new Error('Nome e comentário obrigatórios')
        if (payload.content.length > 500) throw new Error('Comentário muito longo')

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
        await supabase.from('comments').insert({
          post_id: payload.post_id,
          author_name: payload.author_name.trim(),
          content: payload.content.trim(),
          ip
        })
        data = { success: true }
        break
      }

      default: throw new Error('Ação inválida')
    }

    return new Response(JSON.stringify({ data }), { headers: {...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: {...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
