import ApiResponses from '@/api/utils/ApiResponses'

export const GET = () => {
  return ApiResponses.json({
    status: 'ok',
  })
}
