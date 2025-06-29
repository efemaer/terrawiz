/**
 * HTTP client interface for VCS API communications
 */

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * HTTP request headers
 */
export interface HttpHeaders {
  readonly [key: string]: string;
}

/**
 * HTTP request configuration
 */
export interface HttpRequestConfig {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers?: HttpHeaders;
  readonly body?: any;
  readonly timeout?: number;
  readonly retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    retryOn?: number[];
  };
  readonly validateStatus?: (status: number) => boolean;
}

/**
 * HTTP response with metadata
 */
export interface HttpResponse<T = any> {
  readonly data: T;
  readonly status: number;
  readonly statusText: string;
  readonly headers: HttpHeaders;
  readonly requestId?: string;
  readonly duration: number;
}

/**
 * HTTP client interface for making API requests
 */
export interface IHttpClient {
  /**
   * Make a GET request
   */
  get<T = any>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>;

  /**
   * Make a POST request
   */
  post<T = any>(
    url: string,
    data?: any,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a PUT request
   */
  put<T = any>(
    url: string,
    data?: any,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a PATCH request
   */
  patch<T = any>(
    url: string,
    data?: any,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a DELETE request
   */
  delete<T = any>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>;

  /**
   * Make a generic request
   */
  request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>>;

  /**
   * Set default headers for all requests
   */
  setDefaultHeaders(headers: HttpHeaders): void;

  /**
   * Set base URL for all requests
   */
  setBaseUrl(baseUrl: string): void;

  /**
   * Add request interceptor
   */
  addRequestInterceptor(
    interceptor: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>
  ): void;

  /**
   * Add response interceptor
   */
  addResponseInterceptor(
    onSuccess: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>,
    onError?: (error: Error) => Promise<Error>
  ): void;
}

/**
 * HTTP client factory interface
 */
export interface IHttpClientFactory {
  /**
   * Create an HTTP client with configuration
   */
  createClient(config?: HttpClientConfig): IHttpClient;
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  readonly baseUrl?: string;
  readonly timeout?: number;
  readonly defaultHeaders?: HttpHeaders;
  readonly retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    retryOn?: number[];
  };
  readonly validateStatus?: (status: number) => boolean;
  readonly maxRedirects?: number;
  readonly proxy?: {
    host: string;
    port: number;
    protocol?: 'http' | 'https';
    auth?: {
      username: string;
      password: string;
    };
  };
}
