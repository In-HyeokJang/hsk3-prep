-- ============================================================
--  마이그레이션 4 · 검색 함수 버그 고치기
--
--  무슨 일이 있었나:
--    search_words('城市') 를 하면 城市 가 아니라 아무 단어나 나왔습니다.
--
--  왜:
--    병음으로도 찾으려고 검색어에서 영문자·숫자만 남기는 처리를 했는데,
--    한자나 한글로 검색하면 남는 글자가 하나도 없어서 빈 문자열이 됩니다.
--
--      '城市' → 영문자만 남기면 → ''
--      pinyin_plain like '' || '%'  →  like '%'  →  전부 일치
--
--    그래서 조건이 있으나 마나 한 상태가 됐습니다.
--    영문(anpai)으로 검색할 때만 멀쩡했고, 그래서 더 늦게 발견됐을 뻔했습니다.
--
--  고치는 법:
--    병음 조건은 "떼고 나서도 글자가 남았을 때만" 겁니다. (nullif 로 처리)
-- ============================================================

create or replace function public.search_words(
  p_q     text,
  p_limit integer default 30
)
returns setof public.v_words
language sql
stable
security invoker
as $$
  with q as (
    select
      btrim(p_q) as raw,
      -- 성조·띄어쓰기·기호를 뗀 검색어.
      -- 한자나 한글로 검색하면 남는 게 없으므로 nullif 로 null 이 됩니다.
      nullif(
        regexp_replace(
          translate(
            lower(btrim(p_q)),
            'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü',
            'aaaaeeeeiiiioooouuuuuuuuu'
          ),
          '[^a-z0-9]', '', 'g'
        ),
        ''
      ) as py
  )
  select v.*
  from public.v_words v, q
  where q.raw is not null
    and q.raw <> ''
    and (
      v.hanzi      like '%' || q.raw || '%'
      or v.meaning_ko like '%' || q.raw || '%'
      -- ★ 병음 조건은 뗀 결과가 남았을 때만. 이게 이번에 고친 부분입니다.
      or (q.py is not null and v.pinyin_plain like q.py || '%')
    )
  order by v.frequency asc nulls last, v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.search_words(text, integer) is
  '한자·한국어 뜻·병음 아무거나로 검색. 병음은 성조와 띄어쓰기를 무시합니다';
