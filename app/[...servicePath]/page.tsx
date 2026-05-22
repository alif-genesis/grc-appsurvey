import { serviceToSlug, serviceTypes } from '../services';

export function generateStaticParams() {
  return serviceTypes.map((service) => ({
    servicePath: [serviceToSlug(service)],
  }));
}

export { default } from '../page';
