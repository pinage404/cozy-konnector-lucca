const {
  BaseKonnector,
  log,
  requestFactory,
  saveFiles,
  errors
} = require('cozy-konnector-libs')
const request = requestFactory({
  // cheerio: true,
  debug: true,
  json: true,
  jar: true
})
const cheerio = require('cheerio')
const parseISO = require('date-fns/parseISO')
const format = require('date-fns/format')

const baseStartUrl = 'https://www.lucca.fr'
let baseWorkspaceUrl

module.exports = new BaseKonnector(start)
// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  await logIn(fields)
  const payslips = await getPayslips()
  await saveFiles(payslips, fields)
  // .then(convertPayrollsToCozy)
  // .then(documents => saveFiles(documents, fields));
}

async function logIn(fields) {
  log('info', 'First log in to get user company details...')
  try {
    const details = await request({
      uri: baseStartUrl + '/login/ws-auth-service/wsauth.service.php',
      method: 'POST',
      form: {
        mail: fields.login,
        password: fields.password,
        request: 'emailpass'
      }
    })
    baseWorkspaceUrl = details.data[0]

    // const uri =
    //   "https://auth.payfit.com/updateCurrentCompany?application=hr-apps/user&companyId=";

    // return request({
    //   uri: `${uri}${companyId}&customApp=false&employeeId=${employeeId}&holdingId&idToken=${idToken}&origin=https://app.payfit.com`
    // });
  } catch (err) {
    if (
      err.statusCode === 404 &&
      err.error.Message &&
      err.error.Message.includes('Wrong password')
    ) {
      throw new Error(errors.LOGIN_FAILED)
    } else {
      throw new Error(errors.VENDOR_DOWN)
    }
  }

  log('info', "Get the verification token hidden in the company's login's form")
  const form = await request({
    uri: baseWorkspaceUrl + '/identity/login',
    method: 'GET'
  })
  const $ = cheerio.load(form)
  const requestVerificationToken = $(
    'input[name="__RequestVerificationToken"]'
  ).attr('value')

  log('info', 'Log in with company URL')
  try {
    await request({
      uri: baseWorkspaceUrl + '/identity/login',
      method: 'POST',
      form: {
        UserName: fields.login,
        Password: fields.password,
        IsPersistent: true,
        __RequestVerificationToken: requestVerificationToken
      }
    })
    // const uri =
    //   "https://auth.payfit.com/updateCurrentCompany?application=hr-apps/user&companyId=";

    // return request({
    //   uri: `${uri}${companyId}&customApp=false&employeeId=${employeeId}&holdingId&idToken=${idToken}&origin=https://app.payfit.com`
    // });
  } catch (err) {
    if (
      err.statusCode === 400 &&
      err.error &&
      err.error.includes('Vos identifiants sont erron&#233;s')
    ) {
      throw new Error(errors.LOGIN_FAILED)
    }
  }
}

async function getPayslips() {
  log('info', 'Get Pagga userId')
  const userDetails = await request({
    uri: baseWorkspaceUrl + '/api/v3/users/me?fields=id',
    method: 'GET'
  })
  const paggaUserId = userDetails.data.id

  log('info', 'Get Payslips')
  const payslipsInfos = await request({
    uri:
      baseWorkspaceUrl +
      '/api/v3/payslips?fields=id,import[endDate]&orderby=import.endDate,desc,import.startDate,desc,import.creationDate,desc&ownerID=' +
      paggaUserId,
    method: 'GET'
  })

  return payslipsInfos.data.items.map(function(payslip) {
    const url = baseWorkspaceUrl + '/pagga/download/' + payslip.id
    const date = parseISO(payslip.import.endDate)
    const filename = format(date, 'yyyy_MM') + '.pdf'

    return {
      fileurl: url,
      filename
    }
  })
}
