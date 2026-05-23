import { serviceToSlug, serviceTypes } from '../services';
import SurveyForm from '../survey-form';

export const dynamicParams = true;

export function generateStaticParams() {
  return serviceTypes.map((service) => ({
    servicePath: [serviceToSlug(service)],
  }));
}

export default function ServiceSurveyPage() {
  return <SurveyForm />;
}
